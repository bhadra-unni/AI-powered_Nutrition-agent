# 🥗 NutriBot — AI-Powered Nutrition Agent

> Built with **IBM Watsonx.ai Granite** models + **Flask** + **Bootstrap 5**

A full-stack AI nutrition assistant that generates personalized Indian meal plans, analyzes calories, calculates BMI, and creates family diet recommendations — all powered by IBM's Granite foundation models.

---

## 📁 Project Structure

```
nutrition_agent/
├── app.py                  # Flask backend + API endpoints
├── agent_config.py         # ★ AGENT INSTRUCTIONS — customize here
├── requirements.txt
├── .env.example            # Copy to .env and add your credentials
├── .env                    # ← Your real credentials 
│
├── templates/
│   └── index.html          # Full single-page frontend
│
└── static/
    ├── css/
    │   └── style.css       # Custom styles + dark mode
    └── js/
        └── app.js          # Frontend logic (chat, BMI, meal plan…)
```

---

## ⚡ Quick Start

### 1. Clone / navigate to project
```bash
cd nutrition_agent
```

### 2. Create a virtual environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure credentials
```bash
# Copy the template
cp .env.example .env
```

Edit `.env` and fill in:
```env
IBM_API_KEY=your_ibm_cloud_api_key
IBM_PROJECT_ID=your_watsonx_project_id
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-3-3-8b-instruct
FLASK_SECRET_KEY=any-random-string-here
```

### 5. Run the application
```bash
python app.py
```

Open **http://localhost:5000** in your browser.

---

## 🔑 Getting IBM Credentials

### IBM Cloud API Key
1. Log in to [IBM Cloud](https://cloud.ibm.com)
2. Go to **Manage → Access (IAM) → API keys**
3. Click **Create an IBM Cloud API key**
4. Copy the key to `IBM_API_KEY` in `.env`

### Watsonx Project ID
1. Open [IBM Watsonx.ai](https://dataplatform.cloud.ibm.com/wx/home)
2. Open or create a project
3. Go to **Manage → General** tab
4. Copy the **Project ID** to `IBM_PROJECT_ID` in `.env`

### Available Granite Models
| Model ID | Speed | Use Case |
|---|---|---|
| `ibm/granite-3-3-8b-instruct` | ⚡ Fast | Default — great for chat |
| `ibm/granite-3-8b-instruct` | ⚡ Fast | Balanced performance |
| `ibm/granite-13b-instruct-v2` | 🔵 Slower | Most capable |

---

## 🛠️ Customizing the Agent — `agent_config.py`

The `agent_config.py` file is your **one-stop shop** for customizing NutriBot:

### Change Agent Persona (Section 1)
```python
AGENT_PERSONA = """
You are NutriBot, a warm, knowledgeable, and encouraging AI nutrition expert.
# Change tone, name, communication style here
"""
```

### Add Diet Specializations (Section 2)
```python
DIET_SPECIALIZATIONS = [
    "Balanced Indian vegetarian diet",
    "Your custom specialization here",
]
```

### Customize Indian Food Preferences (Section 3)
```python
INDIAN_FOOD_PREFERENCES = {
    "preferred_cuisines": ["North Indian", "South Indian", ...],
    "staple_ingredients": ["dal", "rice", "roti", ...],
    "superfoods_to_highlight": ["turmeric", "amla", ...],
}
```

### Modify Safety Rules (Section 4)
```python
SAFETY_RULES = """
# Add/remove safety constraints
# Change calorie thresholds
# Add specific medical disclaimers
"""
```

### Toggle Features (Section 6)
```python
AGENT_CAPABILITIES = {
    "bmi_analysis": True,
    "meal_planning": True,
    "family_nutrition": True,
    # Set to False to disable any feature
}
```

### Add Custom Quick-Task Prompts (Section 8)
```python
QUICK_PROMPTS["my_custom_task"] = (
    "Your custom prompt template with {variable} placeholders"
)
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Main web application |
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/chat` | AI chat conversation |
| `POST` | `/api/bmi` | BMI + calorie calculator |
| `POST` | `/api/quick-task` | Pre-defined nutrition tasks |
| `POST` | `/api/nutrition-facts` | Food/meal analyzer |
| `POST` | `/api/family-plan` | Family nutrition planner |

### Chat API Example
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Give me a diabetic-friendly Indian lunch",
    "history": [],
    "profile": {
      "name": "Priya",
      "age": 45,
      "gender": "female",
      "health_goals": "Diabetes management",
      "dietary_restrictions": "vegetarian"
    }
  }'
```

### BMI API Example
```bash
curl -X POST http://localhost:5000/api/bmi \
  -H "Content-Type: application/json" \
  -d '{
    "weight_kg": 68,
    "height_cm": 165,
    "age": 35,
    "gender": "female",
    "activity": "moderate",
    "goal": "lose"
  }'
```

---

## 🚀 Production Deployment

### Option A — Gunicorn (Linux/macOS)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Option B — Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

```bash
docker build -t nutribot .
docker run -p 5000:5000 --env-file .env nutribot
```

### Option C — IBM Code Engine
```bash
# Install IBM Cloud CLI + Code Engine plugin
ibmcloud login
ibmcloud ce project create --name nutribot-project
ibmcloud ce app create \
  --name nutribot \
  --image us.icr.io/your-namespace/nutribot:latest \
  --env-from-secret nutribot-secrets \
  --port 5000
```

### Option D — Heroku
```bash
# Add Procfile
echo "web: gunicorn app:app" > Procfile
heroku create nutribot-app
heroku config:set IBM_API_KEY=xxx IBM_PROJECT_ID=yyy
git push heroku main
```

---

## 🔒 Security Notes

- ✅ **Never commit `.env`** — it's in `.gitignore`
- ✅ Use `FLASK_SECRET_KEY` with a strong random value in production
- ✅ Set `FLASK_DEBUG=False` in production
- ✅ Consider rate-limiting the `/api/chat` endpoint in high-traffic deployments
- ✅ For production, use environment variables from your hosting platform instead of `.env`

---

## 🩺 Health & Safety Disclaimers

NutriBot is an **AI assistant**, not a medical professional. All nutrition advice:
- Is for informational purposes only
- Should not replace advice from a registered dietitian or doctor
- May not be suitable for individuals with serious medical conditions
- Is automatically flagged with appropriate disclaimers for vulnerable groups

---

## 📦 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `flask` | 3.0.3 | Web framework |
| `python-dotenv` | 1.0.1 | `.env` file loading |
| `ibm-watsonx-ai` | 1.1.2 | IBM Watsonx.ai SDK |
| `requests` | 2.32.3 | HTTP client |
| `gunicorn` | 22.0.0 | Production WSGI server |

### Frontend CDN Libraries
- Bootstrap 5.3 (CSS framework)
- Bootstrap Icons 1.11 (icon set)
- Google Fonts — Inter + Poppins
- Marked.js 12.0 (Markdown rendering)

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `IBM_API_KEY not configured` | Copy `.env.example` to `.env` and add credentials |
| `404 on static files` | Ensure you run `python app.py` from the `nutrition_agent/` directory |
| `ibm-watsonx-ai import error` | Run `pip install -r requirements.txt` again |
| `Model not found` | Check `WATSONX_MODEL_ID` matches an available Granite model |
| Chat returns empty response | Increase `MAX_NEW_TOKENS` in `app.py` `get_watsonx_model()` |
| Slow responses | Switch to `ibm/granite-3-3-8b-instruct` (fastest model) |

---

## ✨ Features Overview

| Feature | Description |
|---------|-------------|
| 💬 **AI Chat** | Conversational nutrition advice with history |
| 📊 **Dashboard** | BMI, TDEE, macros, water intake tracking |
| 📅 **Meal Planner** | 1/3/7-day AI-generated Indian meal plans |
| ⚖️ **BMI Calculator** | BMI + Mifflin-St Jeor calorie calculation |
| 👨‍👩‍👧‍👦 **Family Plan** | Multi-member family nutrition planning |
| 🔍 **Food Analyzer** | Nutritional analysis of any food/meal |
| 🌙 **Dark Mode** | Full dark theme with localStorage persistence |
| 📱 **Mobile Ready** | Fully responsive Bootstrap layout |

---

*Made with ❤️ using IBM Watsonx.ai Granite + Flask*
