from __future__ import annotations

import base64
import json
import logging
import os
import re
import sqlite3
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from pydantic import BaseModel, ConfigDict, Field, ValidationError

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("MIAO_DB_PATH", ROOT / "miao.sqlite3"))
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

logger = logging.getLogger("miao")
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

app = FastAPI(title="miao", version="1.0.0")
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["*"],
  allow_headers=["*"],
)


def utc_now() -> str:
  return datetime.now(timezone.utc).isoformat()


def db_connect() -> sqlite3.Connection:
  conn = sqlite3.connect(DB_PATH)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA foreign_keys = ON")
  return conn


def init_db() -> None:
  with db_connect() as conn:
    conn.executescript(
      """
      CREATE TABLE IF NOT EXISTS daily_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        daily_record_id INTEGER NOT NULL,
        meal_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (daily_record_id) REFERENCES daily_records(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS food_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id INTEGER NOT NULL,
        food_name TEXT NOT NULL,
        quantity REAL,
        unit TEXT,
        calories REAL NOT NULL DEFAULT 0,
        protein_g REAL NOT NULL DEFAULT 0,
        carbohydrates_g REAL NOT NULL DEFAULT 0,
        fat_g REAL NOT NULL DEFAULT 0,
        confidence TEXT NOT NULL,
        uncertainty_notes TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date);
      CREATE INDEX IF NOT EXISTS idx_meals_daily_record_id ON meals(daily_record_id);
      CREATE INDEX IF NOT EXISTS idx_food_items_meal_id ON food_items(meal_id);
      """
    )


@app.on_event("startup")
def startup() -> None:
  init_db()


class DetectedFood(BaseModel):
  model_config = ConfigDict(extra="forbid")

  food_name: str = Field(min_length=1)
  likely_quantity: Optional[float] = Field(default=None, ge=0)
  likely_unit: Optional[str] = None
  estimated_calories: Optional[float] = Field(default=None, ge=0)
  estimated_protein_g: Optional[float] = Field(default=None, ge=0)
  estimated_carbohydrates_g: Optional[float] = Field(default=None, ge=0)
  estimated_fat_g: Optional[float] = Field(default=None, ge=0)
  confidence: Literal["low", "medium", "high"]
  uncertainty_notes: str


class MealSummary(BaseModel):
  model_config = ConfigDict(extra="forbid")

  estimated_total_calories: Optional[float] = Field(default=None, ge=0)
  estimated_total_protein_g: Optional[float] = Field(default=None, ge=0)
  estimated_total_carbohydrates_g: Optional[float] = Field(default=None, ge=0)
  estimated_total_fat_g: Optional[float] = Field(default=None, ge=0)


class FoodDetectionResponse(BaseModel):
  model_config = ConfigDict(extra="forbid")

  foods: list[DetectedFood] = Field(min_length=1)
  meal_summary: MealSummary
  disclaimer: str


class FoodItemInput(BaseModel):
  model_config = ConfigDict(extra="forbid")

  id: Optional[int] = Field(default=None, ge=1)
  food_name: str = Field(min_length=1, max_length=120)
  quantity: Optional[float] = Field(default=None, ge=0)
  unit: Optional[str] = Field(default=None, max_length=32)
  calories: float = Field(default=0, ge=0)
  protein_g: float = Field(default=0, ge=0)
  carbohydrates_g: float = Field(default=0, ge=0)
  fat_g: float = Field(default=0, ge=0)
  confidence: Literal["low", "medium", "high"] = "medium"
  uncertainty_notes: str = Field(default="", max_length=500)


class MealSaveRequest(BaseModel):
  model_config = ConfigDict(extra="forbid")

  date: str
  meal_name: str = Field(default="Meal", min_length=1, max_length=80)
  foods: list[FoodItemInput] = Field(min_length=1)


class MealUpdateRequest(MealSaveRequest):
  pass


class FoodItemResponse(FoodItemInput):
  id: int


class MealResponse(BaseModel):
  id: int
  date: str
  meal_name: str
  created_at: str
  updated_at: str
  foods: list[FoodItemResponse]


class DailyTotals(BaseModel):
  calories: float
  protein_g: float
  carbohydrates_g: float
  fat_g: float
  meal_count: int


class DayResponse(BaseModel):
  id: int
  date: str
  created_at: str
  updated_at: str
  totals: DailyTotals
  meals: list[MealResponse]


class HistoryResponse(BaseModel):
  days: list[DayResponse]
  has_more: bool
  next_before: Optional[str] = None


class ReportProfile(BaseModel):
  fullName: Optional[str] = None
  height: Optional[float] = Field(default=None, ge=0)
  weight: Optional[float] = Field(default=None, ge=0)
  age: Optional[int] = Field(default=None, ge=0)
  sex: Optional[str] = None


class ReportHealth(BaseModel):
  steps: int = Field(default=0, ge=0)
  walkMinutes: float = Field(default=0, ge=0)


class ReportExercise(BaseModel):
  type: str
  intensity: str
  minutes: float = Field(ge=0)
  calories: float = Field(default=0, ge=0)


class ReportFoodSummary(BaseModel):
  calories: float = Field(default=0, ge=0)
  energy: float = Field(default=0, ge=0)
  protein: float = Field(default=0, ge=0)
  carbohydrates: float = Field(default=0, ge=0)
  fibre: float = Field(default=0, ge=0)


class ReportPdfRequest(BaseModel):
  date: str
  mode: Literal["adult", "child"] = "adult"
  profile: ReportProfile = Field(default_factory=ReportProfile)
  waterMl: float = Field(default=0, ge=0)
  health: ReportHealth = Field(default_factory=ReportHealth)
  exercises: list[ReportExercise] = Field(default_factory=list)
  food: Optional[ReportFoodSummary] = None


FOOD_DETECTION_SCHEMA = {
  "type": "object",
  "additionalProperties": False,
  "required": ["foods", "meal_summary", "disclaimer"],
  "properties": {
    "foods": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "food_name",
          "likely_quantity",
          "likely_unit",
          "estimated_calories",
          "estimated_protein_g",
          "estimated_carbohydrates_g",
          "estimated_fat_g",
          "confidence",
          "uncertainty_notes",
        ],
        "properties": {
          "food_name": {"type": "string"},
          "likely_quantity": {"type": ["number", "null"]},
          "likely_unit": {"type": ["string", "null"]},
          "estimated_calories": {"type": ["number", "null"]},
          "estimated_protein_g": {"type": ["number", "null"]},
          "estimated_carbohydrates_g": {"type": ["number", "null"]},
          "estimated_fat_g": {"type": ["number", "null"]},
          "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
          "uncertainty_notes": {"type": "string"},
        },
      },
    },
    "meal_summary": {
      "type": "object",
      "additionalProperties": False,
      "required": [
        "estimated_total_calories",
        "estimated_total_protein_g",
        "estimated_total_carbohydrates_g",
        "estimated_total_fat_g",
      ],
      "properties": {
        "estimated_total_calories": {"type": ["number", "null"]},
        "estimated_total_protein_g": {"type": ["number", "null"]},
        "estimated_total_carbohydrates_g": {"type": ["number", "null"]},
        "estimated_total_fat_g": {"type": ["number", "null"]},
      },
    },
    "disclaimer": {"type": "string"},
  },
}


def _data_url(content_type: str, data: bytes) -> str:
  encoded = base64.b64encode(data).decode("ascii")
  return f"data:{content_type};base64,{encoded}"


def _extract_output_text(response) -> str:
  output_text = getattr(response, "output_text", None)
  if output_text:
    return output_text

  parts: list[str] = []
  for item in getattr(response, "output", []) or []:
    for content in getattr(item, "content", []) or []:
      text = getattr(content, "text", None)
      if text:
        parts.append(text)
  return "\n".join(parts)


def openai_error_detail(status_code: int, error_body) -> tuple[int, str]:
  if isinstance(error_body, dict):
    error = error_body.get("error", {})
    error_message = error.get("message") or str(error_body)
    error_code = error.get("code")
    error_type = error.get("type")
  else:
    error_message = str(error_body or "OpenAI request failed.")
    error_code = None
    error_type = None

  if error_code == "insufficient_quota" or error_type == "insufficient_quota":
    return (
      402,
      "OpenAI quota exceeded. Check your OpenAI billing plan, usage limits, or add credits, then try Detect Food again.",
    )

  if status_code == 429:
    return (
      429,
      "The AI service is rate limited right now. Wait a moment, then try Detect Food again.",
    )

  if status_code in {401, 403}:
    return (
      503,
      "The OpenAI API key is missing, invalid, or does not have access to this model.",
    )

  return (
    502,
    f"The AI service rejected the food-detection request: {error_message}",
  )


async def read_valid_image(file: UploadFile) -> bytes:
  if not file.filename:
    raise HTTPException(status_code=400, detail="Please choose an image before detecting food.")

  if file.content_type not in ALLOWED_IMAGE_TYPES:
    raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP meal images are supported.")

  data = await file.read(MAX_UPLOAD_BYTES + 1)
  if not data:
    raise HTTPException(status_code=400, detail="The uploaded image is empty.")
  if len(data) > MAX_UPLOAD_BYTES:
    raise HTTPException(status_code=413, detail="The image is too large. Please upload an image under 8 MB.")
  return data


def validate_date(value: str) -> str:
  if not DATE_RE.match(value):
    raise HTTPException(status_code=422, detail="Date must use YYYY-MM-DD format.")
  try:
    datetime.strptime(value, "%Y-%m-%d")
  except ValueError as exc:
    raise HTTPException(status_code=422, detail="Date is not a valid calendar date.") from exc
  return value


def get_or_create_daily_record(conn: sqlite3.Connection, date: str) -> int:
  validate_date(date)
  row = conn.execute("SELECT id FROM daily_records WHERE date = ?", (date,)).fetchone()
  if row:
    return int(row["id"])
  now = utc_now()
  cursor = conn.execute(
    "INSERT INTO daily_records (date, created_at, updated_at) VALUES (?, ?, ?)",
    (date, now, now),
  )
  return int(cursor.lastrowid)


def touch_daily_record(conn: sqlite3.Connection, daily_record_id: int) -> None:
  conn.execute("UPDATE daily_records SET updated_at = ? WHERE id = ?", (utc_now(), daily_record_id))


def delete_empty_daily_record(conn: sqlite3.Connection, daily_record_id: int) -> None:
  count = conn.execute(
    "SELECT COUNT(*) AS count FROM meals WHERE daily_record_id = ?",
    (daily_record_id,),
  ).fetchone()["count"]
  if count == 0:
    conn.execute("DELETE FROM daily_records WHERE id = ?", (daily_record_id,))


def insert_food_items(conn: sqlite3.Connection, meal_id: int, foods: list[FoodItemInput]) -> None:
  conn.executemany(
    """
    INSERT INTO food_items (
      meal_id, food_name, quantity, unit, calories, protein_g, carbohydrates_g, fat_g, confidence, uncertainty_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    [
      (
        meal_id,
        food.food_name.strip(),
        food.quantity,
        (food.unit or "").strip() or None,
        food.calories,
        food.protein_g,
        food.carbohydrates_g,
        food.fat_g,
        food.confidence,
        food.uncertainty_notes.strip(),
      )
      for food in foods
    ],
  )


def row_to_food(row: sqlite3.Row) -> FoodItemResponse:
  return FoodItemResponse(
    id=row["id"],
    food_name=row["food_name"],
    quantity=row["quantity"],
    unit=row["unit"],
    calories=row["calories"],
    protein_g=row["protein_g"],
    carbohydrates_g=row["carbohydrates_g"],
    fat_g=row["fat_g"],
    confidence=row["confidence"],
    uncertainty_notes=row["uncertainty_notes"],
  )


def meal_with_foods(conn: sqlite3.Connection, meal_row: sqlite3.Row, date: str) -> MealResponse:
  foods = conn.execute(
    "SELECT * FROM food_items WHERE meal_id = ? ORDER BY id",
    (meal_row["id"],),
  ).fetchall()
  return MealResponse(
    id=meal_row["id"],
    date=date,
    meal_name=meal_row["meal_name"],
    created_at=meal_row["created_at"],
    updated_at=meal_row["updated_at"],
    foods=[row_to_food(food) for food in foods],
  )


def get_day_response(conn: sqlite3.Connection, date: str) -> Optional[DayResponse]:
  validate_date(date)
  day = conn.execute("SELECT * FROM daily_records WHERE date = ?", (date,)).fetchone()
  if not day:
    return None
  meals = conn.execute(
    "SELECT * FROM meals WHERE daily_record_id = ? ORDER BY created_at, id",
    (day["id"],),
  ).fetchall()
  totals = conn.execute(
    """
    SELECT
      COALESCE(SUM(food_items.calories), 0) AS calories,
      COALESCE(SUM(food_items.protein_g), 0) AS protein_g,
      COALESCE(SUM(food_items.carbohydrates_g), 0) AS carbohydrates_g,
      COALESCE(SUM(food_items.fat_g), 0) AS fat_g,
      COUNT(DISTINCT meals.id) AS meal_count
    FROM meals
    LEFT JOIN food_items ON food_items.meal_id = meals.id
    WHERE meals.daily_record_id = ?
    """,
    (day["id"],),
  ).fetchone()
  return DayResponse(
    id=day["id"],
    date=day["date"],
    created_at=day["created_at"],
    updated_at=day["updated_at"],
    totals=DailyTotals(
      calories=round(float(totals["calories"]), 2),
      protein_g=round(float(totals["protein_g"]), 2),
      carbohydrates_g=round(float(totals["carbohydrates_g"]), 2),
      fat_g=round(float(totals["fat_g"]), 2),
      meal_count=int(totals["meal_count"]),
    ),
    meals=[meal_with_foods(conn, meal, day["date"]) for meal in meals],
  )


def meal_exists(conn: sqlite3.Connection, meal_id: int) -> sqlite3.Row:
  meal = conn.execute(
    """
    SELECT meals.*, daily_records.date AS date, daily_records.id AS old_daily_record_id
    FROM meals
    JOIN daily_records ON daily_records.id = meals.daily_record_id
    WHERE meals.id = ?
    """,
    (meal_id,),
  ).fetchone()
  if not meal:
    raise HTTPException(status_code=404, detail="Meal not found.")
  return meal


def report_guidelines(mode: str) -> dict:
  if mode == "child":
    return {"water_l": 1.7, "calories": 1600, "steps": 10000, "active_minutes": 420}
  return {"water_l": 2.7, "calories": 2100, "steps": 8000, "active_minutes": 150}


def score_label(score: int) -> str:
  if score >= 85:
    return "Strong week"
  if score >= 70:
    return "Good foundation"
  if score >= 55:
    return "Needs tuning"
  return "Needs attention"


def build_pdf_report(payload: ReportPdfRequest, day: Optional[DayResponse]) -> bytes:
  try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
  except ImportError as exc:
    raise HTTPException(
      status_code=503,
      detail="PDF generation requires reportlab. Run: pip install -r requirements.txt",
    ) from exc

  guidelines = report_guidelines(payload.mode)
  water_l = payload.waterMl / 1000
  meal_totals = day.totals if day else DailyTotals(calories=0, protein_g=0, carbohydrates_g=0, fat_g=0, meal_count=0)
  food_summary = payload.food or ReportFoodSummary(
    calories=meal_totals.calories,
    energy=meal_totals.calories,
    protein=meal_totals.protein_g,
    carbohydrates=meal_totals.carbohydrates_g,
  )
  exercise_burn = sum(item.calories for item in payload.exercises)
  walking_burn = round((payload.health.steps or 0) * (payload.profile.weight or 65) * 0.00048)
  total_burn = round(exercise_burn + walking_burn)
  active_minutes = payload.health.walkMinutes + sum(item.minutes for item in payload.exercises)

  water_score = min((water_l / guidelines["water_l"]) * 22, 22) if guidelines["water_l"] else 0
  step_score = min((payload.health.steps / guidelines["steps"]) * 18, 18) if guidelines["steps"] else 0
  activity_score = min(((active_minutes * 7) / guidelines["active_minutes"]) * 20, 20)
  calorie_gap = abs(food_summary.calories - guidelines["calories"])
  calorie_score = max(20 - (calorie_gap / guidelines["calories"]) * 20, 0)
  food_score = 20 if meal_totals.meal_count else 6
  score = round(water_score + step_score + activity_score + calorie_score + food_score)

  buffer = BytesIO()
  doc = SimpleDocTemplate(
    buffer,
    pagesize=letter,
    rightMargin=0.6 * inch,
    leftMargin=0.6 * inch,
    topMargin=0.55 * inch,
    bottomMargin=0.55 * inch,
    title=f"miao health report {payload.date}",
  )
  styles = getSampleStyleSheet()
  styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], fontSize=22, leading=26, textColor=colors.HexColor("#172522")))
  styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=14, leading=18, textColor=colors.HexColor("#1b6657"), spaceBefore=12))
  styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=9, leading=12))

  story = [
    Paragraph("miao Health Report", styles["ReportTitle"]),
    Paragraph(f"Date: {payload.date}", styles["BodyText"]),
    Paragraph(f"Profile: {payload.profile.fullName or 'Unnamed user'} - {payload.mode} mode", styles["BodyText"]),
    Spacer(1, 12),
  ]

  score_table = Table(
    [["Overall score", f"{score}/100", score_label(score)]],
    colWidths=[1.8 * inch, 1.4 * inch, 2.6 * inch],
  )
  score_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#dff3e8")),
    ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#172522")),
    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 14),
    ("PADDING", (0, 0), (-1, -1), 10),
    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#b8ddca")),
  ]))
  story.extend([score_table, Spacer(1, 10)])

  general = (
    f"Estimated intake is {round(food_summary.calories)} kcal per day and "
    f"{round(food_summary.calories * 7)} kcal per week. Estimated exercise expenditure is "
    f"{total_burn} kcal per day and {total_burn * 7} kcal per week, giving a daily net "
    f"estimate of {round(food_summary.calories - total_burn)} kcal."
  )
  story.extend([Paragraph("General Analysis", styles["SectionTitle"]), Paragraph(general, styles["BodyText"])])

  section_rows = [
    ["Water", f"{water_l:.1f} L", f"Target {guidelines['water_l']:.1f} L", "Increase fluids steadily." if water_l < guidelines["water_l"] else "Hydration target met."],
    ["Food", f"{meal_totals.meal_count} meals", f"{round(food_summary.calories)} kcal", "Review meal balance and portion estimates."],
    ["Exercise", f"{round(active_minutes)} min", f"{payload.health.steps} steps", f"Estimated burn {total_burn} kcal."],
  ]
  details = Table([["Section", "Logged", "Reference", "Analysis"]] + section_rows, colWidths=[1.0 * inch, 1.2 * inch, 1.35 * inch, 3.0 * inch])
  details.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#172522")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dce5df")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("PADDING", (0, 0), (-1, -1), 7),
  ]))
  story.extend([Paragraph("Detailed Analysis", styles["SectionTitle"]), details])

  component_table = Table(
    [
      ["Food component", "Logged amount", "Function"],
      ["Energy", f"{round(food_summary.energy)} kcal", "Fuel for daily movement and body functions"],
      ["Protein", f"{round(food_summary.protein)}g", "Supports muscle, growth, and repair"],
      ["Carbohydrates", f"{round(food_summary.carbohydrates)}g", "Primary quick energy source"],
      ["Fibre", f"{round(food_summary.fibre)}g", "Supports digestion and fullness"],
    ],
    colWidths=[1.7 * inch, 1.4 * inch, 3.5 * inch],
  )
  component_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef5f1")),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dce5df")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("PADDING", (0, 0), (-1, -1), 6),
  ]))
  story.extend([Paragraph("Food Components", styles["SectionTitle"]), component_table])

  if day and day.meals:
    meal_rows = [["Meal", "Food", "Calories", "Protein", "Carbs", "Fat"]]
    for meal in day.meals:
      for food in meal.foods:
        meal_rows.append([
          meal.meal_name,
          food.food_name,
          round(food.calories),
          f"{round(food.protein_g)}g",
          f"{round(food.carbohydrates_g)}g",
          f"{round(food.fat_g)}g",
        ])
    meal_table = Table(meal_rows, colWidths=[1.0 * inch, 1.8 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 0.7 * inch])
    meal_table.setStyle(TableStyle([
      ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef5f1")),
      ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dce5df")),
      ("FONTSIZE", (0, 0), (-1, -1), 8),
      ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([Paragraph("Food Details", styles["SectionTitle"]), meal_table])

  story.extend([
    Paragraph("Next Week Advice", styles["SectionTitle"]),
    Paragraph("Keep logging meals consistently, review high-calorie meals for portion accuracy, and balance movement with hydration. These estimates are approximate and are not medical advice.", styles["BodyText"]),
  ])

  def footer(canvas, document):
    canvas.saveState()
    page_width, page_height = document.pagesize
    canvas.setFillColor(colors.white)
    canvas.rect(0, 0, page_width, page_height, fill=1, stroke=0)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#65716e"))
    canvas.drawString(0.6 * inch, 0.35 * inch, "miao report - estimates only, not medical diagnosis")
    canvas.drawRightString(7.9 * inch, 0.35 * inch, f"Page {document.page}")
    canvas.restoreState()

  doc.build(story, onFirstPage=footer, onLaterPages=footer)
  return buffer.getvalue()


def analyze_food_image(image_data_url: str) -> FoodDetectionResponse:
  if not os.getenv("OPENAI_API_KEY"):
    raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not set on the server.")

  client = OpenAI(timeout=35.0)
  try:
    response = client.responses.create(
      model=MODEL,
      input=[
        {
          "role": "user",
          "content": [
            {
              "type": "input_text",
              "text": (
                "Identify distinct visible food items in this meal image. "
                "For each food, estimate portion, calories, protein grams, carbohydrate grams, fat grams, "
                "confidence, and uncertainty notes. Avoid inventing hidden ingredients. Use null when an "
                "estimate cannot reasonably be made. Mention alternatives for ambiguous foods. "
                "Treat all nutrition values as rough visual estimates, not medical facts."
              ),
            },
            {"type": "input_image", "image_url": image_data_url},
          ],
        }
      ],
      text={
        "format": {
          "type": "json_schema",
          "name": "food_detection",
          "strict": True,
          "schema": FOOD_DETECTION_SCHEMA,
        }
      },
    )
  except APITimeoutError as exc:
    logger.warning("OpenAI food detection timed out")
    raise HTTPException(status_code=504, detail="Food detection timed out. Please try again.") from exc
  except APIConnectionError as exc:
    logger.warning("OpenAI food detection connection error")
    raise HTTPException(status_code=502, detail="Could not reach the AI service. Please try again.") from exc
  except APIStatusError as exc:
    error_body = getattr(exc, "body", None)
    status_code, detail = openai_error_detail(exc.status_code, error_body or exc)
    logger.warning("OpenAI food detection failed with status %s: %s", exc.status_code, detail)
    raise HTTPException(status_code=status_code, detail=detail) from exc

  try:
    parsed = json.loads(_extract_output_text(response))
    return FoodDetectionResponse.model_validate(parsed)
  except (json.JSONDecodeError, ValidationError) as exc:
    logger.warning("Malformed model output for food detection")
    raise HTTPException(status_code=502, detail="The AI response was malformed. Please retry.") from exc


@app.post("/api/detect-food", response_model=FoodDetectionResponse)
async def detect_food(image: Optional[UploadFile] = File(default=None)):
  if image is None:
    raise HTTPException(status_code=400, detail="Please choose an image before detecting food.")
  image_bytes = await read_valid_image(image)
  logger.info("Analyzing uploaded meal image: type=%s bytes=%s", image.content_type, len(image_bytes))
  return analyze_food_image(_data_url(image.content_type or "image/jpeg", image_bytes))


@app.post("/api/meals", response_model=MealResponse)
async def save_meal(payload: MealSaveRequest):
  date = validate_date(payload.date)
  with db_connect() as conn:
    daily_record_id = get_or_create_daily_record(conn, date)
    now = utc_now()
    cursor = conn.execute(
      """
      INSERT INTO meals (daily_record_id, meal_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      """,
      (daily_record_id, payload.meal_name.strip(), now, now),
    )
    meal_id = int(cursor.lastrowid)
    insert_food_items(conn, meal_id, payload.foods)
    touch_daily_record(conn, daily_record_id)
    meal_row = conn.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
    return meal_with_foods(conn, meal_row, date)


@app.get("/api/days/{date}", response_model=DayResponse)
async def get_day(date: str):
  with db_connect() as conn:
    day = get_day_response(conn, date)
    if not day:
      raise HTTPException(status_code=404, detail="No meals saved for this date.")
    return day


@app.get("/api/history", response_model=HistoryResponse)
async def get_history(before: Optional[str] = None, limit: int = 10):
  if limit < 1 or limit > 31:
    raise HTTPException(status_code=422, detail="History limit must be between 1 and 31.")
  before_date = validate_date(before) if before else datetime.now().strftime("%Y-%m-%d")
  operator = "<" if before else "<="

  with db_connect() as conn:
    rows = conn.execute(
      f"""
      SELECT date FROM daily_records
      WHERE date {operator} ?
      ORDER BY date DESC
      LIMIT ?
      """,
      (before_date, limit + 1),
    ).fetchall()
    selected = rows[:limit]
    days = [get_day_response(conn, row["date"]) for row in selected]
    next_before = None
    if len(rows) > limit and selected:
      next_before = selected[-1]["date"]
    return HistoryResponse(
      days=[day for day in days if day is not None],
      has_more=len(rows) > limit,
      next_before=next_before,
    )


@app.patch("/api/meals/{meal_id}", response_model=MealResponse)
async def update_meal(meal_id: int, payload: MealUpdateRequest):
  if meal_id < 1:
    raise HTTPException(status_code=422, detail="Meal ID must be positive.")
  new_date = validate_date(payload.date)
  with db_connect() as conn:
    existing = meal_exists(conn, meal_id)
    old_daily_record_id = int(existing["old_daily_record_id"])
    new_daily_record_id = get_or_create_daily_record(conn, new_date)
    now = utc_now()
    conn.execute(
      """
      UPDATE meals
      SET daily_record_id = ?, meal_name = ?, updated_at = ?
      WHERE id = ?
      """,
      (new_daily_record_id, payload.meal_name.strip(), now, meal_id),
    )
    conn.execute("DELETE FROM food_items WHERE meal_id = ?", (meal_id,))
    insert_food_items(conn, meal_id, payload.foods)
    touch_daily_record(conn, new_daily_record_id)
    if old_daily_record_id != new_daily_record_id:
      touch_daily_record(conn, old_daily_record_id)
      delete_empty_daily_record(conn, old_daily_record_id)
    meal_row = conn.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
    return meal_with_foods(conn, meal_row, new_date)


@app.delete("/api/meals/{meal_id}")
async def delete_meal(meal_id: int):
  if meal_id < 1:
    raise HTTPException(status_code=422, detail="Meal ID must be positive.")
  with db_connect() as conn:
    existing = meal_exists(conn, meal_id)
    daily_record_id = int(existing["old_daily_record_id"])
    conn.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
    touch_daily_record(conn, daily_record_id)
    delete_empty_daily_record(conn, daily_record_id)
    return {"ok": True, "deleted_meal_id": meal_id}


@app.post("/api/report/pdf")
async def create_report_pdf(payload: ReportPdfRequest):
  report_date = validate_date(payload.date)
  with db_connect() as conn:
    day = get_day_response(conn, report_date)
  pdf_bytes = build_pdf_report(payload, day)
  filename = f"miao-health-report-{report_date}.pdf"
  return StreamingResponse(
    BytesIO(pdf_bytes),
    media_type="application/pdf",
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
  )


@app.get("/")
async def index():
  return FileResponse(ROOT / "index.html")


@app.get("/api")
@app.get("/api/")
async def api_index():
  return FileResponse(ROOT / "index.html")


app.mount("/", StaticFiles(directory=ROOT, html=True), name="static")
