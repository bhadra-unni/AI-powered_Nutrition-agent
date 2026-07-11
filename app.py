"""
IBM Watsonx.ai Nutrition Agent — Flask Backend
================================================
Main application file. Run with:
    python app.py
Or in production:
    gunicorn -w 4 -b 0.0.0.0:5000 app:app
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional
from flask import Flask, request, jsonify, render_template, session
from dotenv import load_dotenv
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

# Import customizable agent instructions
from agent_config import (
    build_system_prompt,
    QUICK_PROMPTS,
    AGENT_NAME,
    AGENT_TAGLINE,
    INDIAN_FOOD_PREFERENCES,
    AGENT_CAPABILITIES,
)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")

# ---------------------------------------------------------------------------
# IBM Watsonx.ai Client Initialisation
# ---------------------------------------------------------------------------
_watsonx_model: Optional[ModelInference] = None


def _classify_watsonx_error(exc: Exception) -> str:
    """
    Inspect a Watsonx SDK or requests exception and return a human-readable
    message that tells the user exactly what to fix.
    """
    msg = str(exc)
    msg_lower = msg.lower()

    if "wscpa0000e" in msg_lower or "cannot set project or space" in msg_lower:
        project_id = os.getenv("IBM_PROJECT_ID", "<not set>")
        return (
            f"❌ Project ID not found on IBM Watsonx.ai.\n\n"
            f"The project ID currently set is:\n  {project_id}\n\n"
            "How to fix:\n"
            "1. Open https://dataplatform.cloud.ibm.com/wx/home\n"
            "2. Open your Watsonx project → Manage tab → General\n"
            "3. Copy the exact Project ID shown there\n"
            "4. Paste it as IBM_PROJECT_ID in your .env file\n"
            "5. Restart the Flask server\n\n"
            "Common causes:\n"
            "• Copied the wrong ID (e.g. a Space ID instead of a Project ID)\n"
            "• The project was deleted or is in a different IBM Cloud region\n"
            "• Using a US-South project ID but IBM_WATSONX_URL points to EU-DE\n"
            f"  (current URL: {os.getenv('IBM_WATSONX_URL', 'https://us-south.ml.cloud.ibm.com')})"
        )

    if "not_found" in msg_lower or "404" in msg:
        return (
            "❌ IBM Watsonx.ai returned 404 Not Found.\n\n"
            "Check:\n"
            "• IBM_PROJECT_ID is correct (open your project → Manage → General)\n"
            "• IBM_WATSONX_URL matches the region where your project lives\n"
            "  US-South: https://us-south.ml.cloud.ibm.com\n"
            "  EU-DE:    https://eu-de.ml.cloud.ibm.com\n"
            "  JP-TOK:   https://jp-tok.ml.cloud.ibm.com\n"
            f"• Current URL in .env: {os.getenv('IBM_WATSONX_URL', 'not set')}"
        )

    if "401" in msg or "unauthorized" in msg_lower or "forbidden" in msg_lower:
        return (
            "❌ IBM API Key is invalid or expired.\n\n"
            "How to fix:\n"
            "1. Open https://cloud.ibm.com → Manage → Access (IAM) → API keys\n"
            "2. Create a new API key and copy it\n"
            "3. Update IBM_API_KEY in your .env file\n"
            "4. Restart the Flask server"
        )

    if ("not supported" in msg_lower or "supported models" in msg_lower
            or ("model" in msg_lower and ("not found" in msg_lower or "invalid" in msg_lower))):
        model_id = os.getenv("WATSONX_MODEL_ID", "meta-llama/llama-3-3-70b-instruct")
        return (
            f"❌ Model '{model_id}' is not available in your Watsonx.ai environment.\n\n"
            "Instruct / chat models available in most environments:\n"
            "  meta-llama/llama-3-3-70b-instruct  ← recommended (most capable)\n"
            "  meta-llama/llama-3-1-8b             ← fast / lightweight\n"
            "  ibm/granite-3-1-8b-base             ← IBM Granite (base, less instruction-tuned)\n\n"
            "How to fix:\n"
            "1. Open your .env file\n"
            "2. Set  WATSONX_MODEL_ID=meta-llama/llama-3-3-70b-instruct\n"
            "3. Save and restart the Flask server\n\n"
            "To see all models available in your project:\n"
            "  Open Watsonx.ai → Prompt Lab → change model → browse list."
        )

    if "connection" in msg_lower or "timeout" in msg_lower or "network" in msg_lower:
        return (
            "❌ Cannot reach IBM Watsonx.ai — network error.\n\n"
            f"Tried to connect to: {os.getenv('IBM_WATSONX_URL', 'https://us-south.ml.cloud.ibm.com')}\n"
            "Check your internet connection and that the URL is reachable."
        )

    # Generic fallback — include the raw message for diagnostics
    return f"❌ IBM Watsonx.ai error: {msg}"


def get_watsonx_model() -> ModelInference:
    """
    Lazy-initialise the Watsonx model (singleton per worker).
    Raises EnvironmentError with an actionable message on any config problem.
    """
    global _watsonx_model
    if _watsonx_model is not None:
        return _watsonx_model

    api_key = os.getenv("IBM_API_KEY", "").strip()
    project_id = os.getenv("IBM_PROJECT_ID", "").strip()
    watsonx_url = os.getenv("IBM_WATSONX_URL", "https://us-south.ml.cloud.ibm.com").strip()
    model_id = os.getenv("WATSONX_MODEL_ID", "meta-llama/llama-3-3-70b-instruct").strip()

    # ── Pre-flight checks ──────────────────────────────────────────────────
    if not api_key or api_key == "your_ibm_cloud_api_key_here":
        raise EnvironmentError(
            "❌ IBM_API_KEY is not set.\n\n"
            "How to fix:\n"
            "1. Open https://cloud.ibm.com → Manage → Access (IAM) → API keys\n"
            "2. Create a new IBM Cloud API key\n"
            "3. Add it to your .env file: IBM_API_KEY=<your key>\n"
            "4. Restart the Flask server"
        )

    if not project_id or project_id == "your_watsonx_project_id_here":
        raise EnvironmentError(
            "❌ IBM_PROJECT_ID is not set.\n\n"
            "How to fix:\n"
            "1. Open https://dataplatform.cloud.ibm.com/wx/home\n"
            "2. Open your project → Manage tab → General section\n"
            "3. Copy the Project ID (a UUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)\n"
            "4. Add it to your .env file: IBM_PROJECT_ID=<your project id>\n"
            "5. Restart the Flask server"
        )

    # ── Initialise client & model ──────────────────────────────────────────
    try:
        credentials = Credentials(url=watsonx_url, api_key=api_key)
        client = APIClient(credentials=credentials, project_id=project_id)

        model = ModelInference(
            model_id=model_id,
            api_client=client,
            project_id=project_id,
            params={
                GenParams.MAX_NEW_TOKENS: 1024,
                GenParams.MIN_NEW_TOKENS: 20,
                GenParams.TEMPERATURE: 0.7,
                GenParams.TOP_P: 0.9,
                GenParams.TOP_K: 50,
                GenParams.REPETITION_PENALTY: 1.1,
            },
        )
        logger.info("Watsonx model '%s' initialised successfully.", model_id)
        _watsonx_model = model
        return _watsonx_model

    except Exception as exc:
        # Do NOT cache a failed model — allow retry after config fix
        _watsonx_model = None
        friendly = _classify_watsonx_error(exc)
        logger.error("Watsonx initialisation failed: %s", exc)
        raise EnvironmentError(friendly) from exc


# ---------------------------------------------------------------------------
# Helper: Build messages list for chat (sliding window history)
# ---------------------------------------------------------------------------
MAX_HISTORY = int(os.getenv("MAX_CHAT_HISTORY", 20))


# Llama 3 special token IDs used in its chat template
_LLAMA3_ROLES = {"system": "system", "user": "user", "assistant": "assistant"}


def _is_llama_model(model_id: str) -> bool:
    return "llama" in model_id.lower()


def build_chat_prompt(user_message: str, history: list, user_profile: dict) -> str:
    """
    Constructs the full prompt string for the active model family.

    Llama 3 instruct chat template:
        <|begin_of_text|>
        <|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|>
        <|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|>
        <|start_header_id|>assistant<|end_header_id|>\n\n

    Granite instruct chat template (fallback):
        <|system|>\n{system}\n<|user|>\n{user}\n<|assistant|>\n
    """
    model_id = os.getenv("WATSONX_MODEL_ID", "meta-llama/llama-3-3-70b-instruct")
    system_prompt = build_system_prompt(user_profile)

    if _is_llama_model(model_id):
        # ── Llama 3 format ─────────────────────────────────────────────────
        prompt = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|>"

        for turn in history[-MAX_HISTORY:]:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            llama_role = _LLAMA3_ROLES.get(role, "user")
            prompt += f"<|start_header_id|>{llama_role}<|end_header_id|>\n\n{content}<|eot_id|>"

        prompt += (
            f"<|start_header_id|>user<|end_header_id|>\n\n{user_message}<|eot_id|>"
            f"<|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    else:
        # ── Granite / generic instruct format ──────────────────────────────
        prompt = f"<|system|>\n{system_prompt}\n"

        for turn in history[-MAX_HISTORY:]:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            tag = "<|user|>" if role == "user" else "<|assistant|>"
            prompt += f"{tag}\n{content}\n"

        prompt += f"<|user|>\n{user_message}\n<|assistant|>\n"

    return prompt


# ---------------------------------------------------------------------------
# Helper: BMI Calculation
# ---------------------------------------------------------------------------
def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    """Returns BMI value, category, healthy weight range, and advice."""
    height_m = height_cm / 100
    bmi = round(weight_kg / (height_m ** 2), 1)

    if bmi < 18.5:
        category = "Underweight"
        color = "info"
        advice = "Focus on calorie-dense, nutrient-rich foods to gain healthy weight."
    elif bmi < 25:
        category = "Normal weight"
        color = "success"
        advice = "Great! Maintain your current healthy eating habits."
    elif bmi < 30:
        category = "Overweight"
        color = "warning"
        advice = "A moderate calorie deficit with regular exercise can help."
    else:
        category = "Obese"
        color = "danger"
        advice = "Consider consulting a dietitian for a structured weight management plan."

    healthy_min = round(18.5 * (height_m ** 2), 1)
    healthy_max = round(24.9 * (height_m ** 2), 1)

    return {
        "bmi": bmi,
        "category": category,
        "color": color,
        "advice": advice,
        "healthy_range": f"{healthy_min} – {healthy_max} kg",
    }


# ---------------------------------------------------------------------------
# Helper: Daily Calorie Needs (Mifflin-St Jeor)
# ---------------------------------------------------------------------------
ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}


def calculate_tdee(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: str,
    activity: str,
    goal: str,
) -> dict:
    """
    Total Daily Energy Expenditure using Mifflin-St Jeor BMR
    adjusted for activity and goal.
    """
    if gender.lower() in ("male", "m"):
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

    multiplier = ACTIVITY_MULTIPLIERS.get(activity.lower(), 1.55)
    tdee = round(bmr * multiplier)

    goal_calories = tdee
    goal_label = "Maintain weight"
    if goal == "lose":
        goal_calories = tdee - 500
        goal_label = "Lose weight (–500 kcal deficit)"
    elif goal == "gain":
        goal_calories = tdee + 300
        goal_label = "Gain muscle (+300 kcal surplus)"

    # Macro split (40% carbs, 30% protein, 30% fat)
    carbs_g = round((goal_calories * 0.40) / 4)
    protein_g = round((goal_calories * 0.30) / 4)
    fat_g = round((goal_calories * 0.30) / 9)

    return {
        "bmr": round(bmr),
        "tdee": tdee,
        "goal_calories": max(1200, goal_calories),
        "goal_label": goal_label,
        "macros": {
            "carbohydrates_g": carbs_g,
            "protein_g": protein_g,
            "fat_g": fat_g,
        },
        "water_ml": round(weight_kg * 35),
    }


# ---------------------------------------------------------------------------
# Routes — Pages
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Main application page."""
    return render_template(
        "index.html",
        agent_name=AGENT_NAME,
        agent_tagline=AGENT_TAGLINE,
        capabilities=AGENT_CAPABILITIES,
    )


# ---------------------------------------------------------------------------
# Routes — API: Chat
# ---------------------------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def api_chat():
    """
    Main chat endpoint.
    Body: { "message": str, "history": list, "profile": dict }
    Returns: { "reply": str, "timestamp": str }
    """
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    history = data.get("history") or []
    profile = data.get("profile") or {}

    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    try:
        model = get_watsonx_model()
        prompt = build_chat_prompt(user_message, history, profile)
        result = model.generate_text(prompt=prompt)
        reply = result.strip() if isinstance(result, str) else str(result)
        return jsonify({"reply": reply, "timestamp": datetime.now().isoformat()})
    except EnvironmentError as e:
        logger.error("Configuration error: %s", e)
        return jsonify({"error": str(e), "config_error": True}), 503
    except Exception as e:
        friendly = _classify_watsonx_error(e)
        logger.exception("Watsonx call failed")
        return jsonify({"error": friendly, "config_error": True}), 500


# ---------------------------------------------------------------------------
# Routes — API: Quick Task
# ---------------------------------------------------------------------------
@app.route("/api/quick-task", methods=["POST"])
def api_quick_task():
    """
    Trigger a pre-defined nutrition task.
    Body: { "task": str, "params": dict, "profile": dict }
    """
    data = request.get_json(silent=True) or {}
    task = data.get("task", "")
    params = data.get("params") or {}
    profile = data.get("profile") or {}

    if task not in QUICK_PROMPTS:
        return jsonify({"error": f"Unknown task '{task}'."}), 400

    try:
        message = QUICK_PROMPTS[task].format(**params)
    except KeyError as e:
        return jsonify({"error": f"Missing parameter for task: {e}"}), 400

    try:
        model = get_watsonx_model()
        prompt = build_chat_prompt(message, [], profile)
        result = model.generate_text(prompt=prompt)
        reply = result.strip() if isinstance(result, str) else str(result)
        return jsonify({"reply": reply, "task": task, "timestamp": datetime.now().isoformat()})
    except Exception as e:
        logger.exception("Quick task failed")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Routes — API: BMI Calculator
# ---------------------------------------------------------------------------
@app.route("/api/bmi", methods=["POST"])
def api_bmi():
    """
    Calculate BMI and return analysis.
    Body: { "weight_kg": float, "height_cm": float,
            "age": int, "gender": str, "activity": str, "goal": str }
    """
    data = request.get_json(silent=True) or {}
    try:
        weight = float(data["weight_kg"])
        height = float(data["height_cm"])
        age = int(data.get("age", 30))
        gender = data.get("gender", "female")
        activity = data.get("activity", "moderate")
        goal = data.get("goal", "maintain")
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400

    bmi_data = calculate_bmi(weight, height)
    tdee_data = calculate_tdee(weight, height, age, gender, activity, goal)

    return jsonify({**bmi_data, **tdee_data})


# ---------------------------------------------------------------------------
# Routes — API: Nutrition Facts (static reference data)
# ---------------------------------------------------------------------------
@app.route("/api/nutrition-facts", methods=["POST"])
def api_nutrition_facts():
    """
    Use AI to analyze a food item or meal description.
    Body: { "food": str, "profile": dict }
    """
    data = request.get_json(silent=True) or {}
    food = (data.get("food") or "").strip()
    profile = data.get("profile") or {}

    if not food:
        return jsonify({"error": "Please provide a food item or meal description."}), 400

    message = QUICK_PROMPTS["calorie_analysis"].format(meal=food)
    try:
        model = get_watsonx_model()
        prompt = build_chat_prompt(message, [], profile)
        result = model.generate_text(prompt=prompt)
        reply = result.strip() if isinstance(result, str) else str(result)
        return jsonify({"reply": reply, "food": food})
    except Exception as e:
        logger.exception("Nutrition facts call failed")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Routes — API: Family Meal Plan
# ---------------------------------------------------------------------------
@app.route("/api/family-plan", methods=["POST"])
def api_family_plan():
    """
    Generate a family nutrition plan.
    Body: { "members": list[dict], "profile": dict }
    Each member: { "name": str, "age": int, "gender": str,
                   "health_goal": str, "restrictions": str }
    """
    data = request.get_json(silent=True) or {}
    members = data.get("members") or []
    profile = data.get("profile") or {}

    if not members:
        return jsonify({"error": "Please add at least one family member."}), 400

    members_text = "; ".join([
        f"{m.get('name','Member')} (age {m.get('age','?')}, {m.get('gender','?')}, "
        f"goal: {m.get('health_goal','wellness')}, restrictions: {m.get('restrictions','none')})"
        for m in members
    ])

    message = QUICK_PROMPTS["family_plan"].format(members=members_text)
    try:
        model = get_watsonx_model()
        prompt = build_chat_prompt(message, [], profile)
        result = model.generate_text(prompt=prompt)
        reply = result.strip() if isinstance(result, str) else str(result)
        return jsonify({"reply": reply, "member_count": len(members)})
    except Exception as e:
        logger.exception("Family plan call failed")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Routes — API: Health Status
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def api_health():
    """
    Service health check endpoint.
    Validates that both env vars are set AND are not the placeholder values
    from .env.example (catches the case where the user forgot to fill them in).
    """
    api_key = os.getenv("IBM_API_KEY", "")
    project_id = os.getenv("IBM_PROJECT_ID", "")

    api_key_ok = bool(api_key and api_key != "your_ibm_cloud_api_key_here")
    project_id_ok = bool(project_id and project_id != "your_watsonx_project_id_here")
    config_ok = api_key_ok and project_id_ok

    issues = []
    if not api_key_ok:
        issues.append("IBM_API_KEY is missing or still set to the placeholder value")
    if not project_id_ok:
        issues.append("IBM_PROJECT_ID is missing or still set to the placeholder value")

    return jsonify({
        "status": "ok",
        "agent": AGENT_NAME,
        "model": os.getenv("WATSONX_MODEL_ID", "meta-llama/llama-3-3-70b-instruct"),
        "watsonx_url": os.getenv("IBM_WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
        "config_ready": config_ok,
        "config_issues": issues,
        "timestamp": datetime.now().isoformat(),
    })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    logger.info("Starting %s on port %d (debug=%s)", AGENT_NAME, port, debug)
    app.run(host="0.0.0.0", port=port, debug=debug)
