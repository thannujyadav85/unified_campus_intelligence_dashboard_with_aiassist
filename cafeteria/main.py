from typing import Any
import os
from pymongo import MongoClient
from pymongo.server_api import ServerApi
import certifi
import httpx
from mcp.server.fastmcp import FastMCP

from dotenv import load_dotenv

# Load env variables from .env if present
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("cafeteria")
uri = os.getenv("MONGODB_URI")
if not uri:
    raise RuntimeError("MONGODB_URI environment variable is missing. Please set it in your .env file or server configuration.")

# Constants
# 2. Mock Database
client = MongoClient(uri, server_api=ServerApi('1'), connect=False, tlsCAFile=certifi.where())
db = client["cluster0"]  # Database Name
menu_collection = db["cafeteria"]   # Collection (Table) Name


# --- 1. PUBLIC READ TOOL (Anyone can read) ---
@mcp.tool()
def get_cafeteria_menu(day: str) -> str:
    """
    Retrieves the campus cafeteria menu for a given day from the cloud database.
    """
    day_clean = day.strip().lower()
    
    # Search MongoDB for the document
    record = menu_collection.find_one({"day": day_clean})
    
    if not record:
        return f"No menu found for {day.capitalize()} in the cloud database."
        
    return f"🍳 Breakfast: {record.get('breakfast', 'Not Set')} | 🍲 Lunch: {record.get('lunch', 'Not Set')} | 🌙 Dinner: {record.get('dinner', 'Not Set')}"


# --- 2. PUBLIC WRITE TOOL (Anyone can make a change!) ---
@mcp.tool()
def update_cafeteria_menu(day: str, meal_type: str, new_items: str) -> str:
    """
    Updates a specific meal item in the MongoDB cloud database. No password required.
    
    Args:
        day (str): The day to update (e.g., 'monday', 'tuesday').
        meal_type (str): 'breakfast', 'lunch', or 'dinner'.
        new_items (str): The new food items to write to the server.
    """
    day_clean = day.strip().lower()
    meal_clean = meal_type.strip().lower()
    
    if meal_clean not in ["breakfast", "lunch", "dinner"]:
        return f"❌ Error: '{meal_type}' is invalid. Choose breakfast, lunch, or dinner."

    # Directly update the cloud document (creates it if it doesn't exist via upsert)
    menu_collection.update_one(
        {"day": day_clean},
        {"$set": {meal_clean: new_items}},
        upsert=True
    )
    
    return f"✅ Successfully changed server! {day.capitalize()} {meal_type.capitalize()} is now: {new_items}"
def main():
    # Initialize and run the server
    mcp.run()


if __name__ == "__main__":
    main()