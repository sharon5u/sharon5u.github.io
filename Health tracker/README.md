# miao Health Tracker App

This is a computer / phone-installable health tracking web APP with real AI meal photo analysis through a FastAPI backend. The app lets users record water, meals, movement, exercise, profile information, mood check-ins, and generate health reports.

# OpenAI API

The app calls the OpenAI API from `main.py` using the OpenAI Python SDK. When the user uploads a meal photo, the frontend sends the image to the FastAPI endpoint, and the backend passes the image to the OpenAI model (GPT-5.6) with instructions to identify visible foods, estimate calories and nutrients, and return structured JSON. The returned data includes food names, estimated portions, calories, protein, carbohydrates, fat, confidence level, uncertainty notes, and meal totals, which are then displayed and saved by the frontend. 

The app requires an OpenAI API key for AI food detection, so users should create their own key from the OpenAI platform, place it in a private .env file as OPENAI_API_KEY=your_key_here. To run the app, install the dependencies with pip install -r requirements.txt, then start the FastAPI server with uvicorn main:app --host 127.0.0.1 --port 8765 and open http://127.0.0.1:8765 in a browser.
