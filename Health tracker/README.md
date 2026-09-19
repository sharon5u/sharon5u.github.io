# miao Phone App

This is a phone-installable PWA with real AI meal photo analysis through a FastAPI backend.

## Run with AI food identification

```bash
cd /Users/sharon.wu/Documents/Codex/2026-07-15/hi/outputs/health-tracker
/Users/sharon.wu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY="your_api_key_here"
uvicorn main:app --host 127.0.0.1 --port 8765
```

Open `http://127.0.0.1:8765` on the same machine. For phone testing, deploy this folder to HTTPS or expose it through a secure tunnel; camera capture and PWA installation work best on HTTPS.

Optional:

```bash
export OPENAI_MODEL="gpt-5.6"
```

When you select or drop a meal photo and tap **Detect Food**, the app sends the image as `multipart/form-data` to `/api/detect-food`. The server keeps your API key private, calls the vision model, validates the structured result, and returns detected foods, estimated portions, calories, protein, carbohydrates, fat, confidence, uncertainty notes, totals, and a disclaimer.

## Meal history storage

Saved meals are stored locally in SQLite at:

```text
/Users/sharon.wu/Documents/Codex/2026-07-15/hi/outputs/health-tracker/miao.sqlite3
```

The database is initialized automatically when the FastAPI server starts. Existing records are preserved across page refreshes and server restarts.

Optional custom database path:

```bash
export MIAO_DB_PATH="/path/to/miao.sqlite3"
```

Meal history APIs:

- `POST /api/meals`
- `GET /api/history?before=<date>&limit=<number>`
- `GET /api/days/{date}`
- `PATCH /api/meals/{meal_id}`
- `DELETE /api/meals/{meal_id}`

## PDF health reports

On the report page, tap **Download PDF** to generate a `miao-health-report-<date>.pdf` file. The PDF includes the overall score, a general intake/exercise summary, detailed sections for water, food, and exercise, food-component totals, saved meal details, and next-week advice.

The PDF endpoint is:

- `POST /api/report/pdf`

If the server says PDF generation is unavailable, rerun:

```bash
pip install -r requirements.txt
```

## Test

```bash
cd /Users/sharon.wu/Documents/Codex/2026-07-15/hi/outputs/health-tracker
. .venv/bin/activate
pytest
```
