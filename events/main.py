
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
mcp = FastMCP("events")
uri = os.getenv("MONGODB_URI")
if not uri:
    raise RuntimeError("MONGODB_URI environment variable is missing. Please set it in your .env file or server configuration.")

# Constants
# 2. Mock Database
client = MongoClient(uri, server_api=ServerApi('1'), connect=False, tlsCAFile=certifi.where())
db = client["cluster0"]  # Database Name
events_collection = db["events"]   # Collection (Table) Name


# --- 1. PUBLIC READ TOOL (Anyone can read) ---
@mcp.tool()
def get_campus_events() -> str:
    """
    Retrieves a list of all upcoming campus events from the cloud database.
    """
    # Fetch all event documents from MongoDB, hiding the internal MongoDB '_id'
    records = list(events_collection.find({}, {"_id": 0}))
    
    if not records:
        return "📅 No upcoming events scheduled on campus right now."
        
    output = ["📌 **Upcoming Campus Events:**\n"]
    for idx, item in enumerate(records, 1):
        output.append(
            f"{idx}. 🏆 **{item.get('title', 'Untitled')}**\n"
            f"   📅 Date: {item.get('date', 'N/A')} | ⏰ Time: {item.get('time', 'N/A')}\n"
            f"   📍 Venue: {item.get('venue', 'N/A')}\n"
            f"   📝 Info: {item.get('description', 'No details provided.')}\n"
        )
        
    return "\n".join(output)


# --- 2. PUBLIC WRITE TOOL (Anyone can submit or update an event) ---
@mcp.tool()
def add_campus_event(title: str, date: str, time: str, venue: str, description: str) -> str:
    """
    Adds a new event or updates an existing one in the MongoDB cloud database. No password required.
    
    Args:
        title (str): Name of the event (e.g., 'Cognizance 2026', 'Thomso Tech Fest').
        date (str): Date of the event (e.g., 'Oct 15').
        time (str): Timing (e.g., '5:00 PM').
        venue (str): Location on campus (e.g., 'MAC Auditorium').
        description (str): Short summary of what the event is about.
    """
    title_clean = title.strip()
    
    event_document = {
        "title": title_clean,
        "date": date.strip(),
        "time": time.strip(),
        "venue": venue.strip(),
        "description": description.strip()
    }
    
    # Matches the event by title. If it exists, updates it. If not, inserts it (upsert=True).
    events_collection.update_one(
        {"title": title_clean},
        {"$set": event_document},
        upsert=True
    )
    
    return f"✅ Success! Managed to update the server for event: '{title_clean}'."
def main():
    # Initialize and run the server
    mcp.run()


if __name__ == "__main__":
    main()