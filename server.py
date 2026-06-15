import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# 1. Directly import the mcp application instances from your subfolders
from academics.main import mcp as academics_mcp
from cafeteria.main import mcp as cafeteria_mcp
from events.main import mcp as events_mcp
from library.main import mcp as library_mcp

# Import the Google GenAI Engine
from google import genai

load_dotenv()

app = FastAPI(title="IITR Native High-Performance Gateway")

# Enable secure communication with your React frontend port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the Gemini engine (reads the AQ. key out of your root .env file)
gemini_client = genai.Client()

import contextvars
import re
from functools import wraps

# ContextVar to track request-local execution steps across threads/coroutines
request_steps = contextvars.ContextVar("request_steps", default=None)
user_role = contextvars.ContextVar("user_role", default="student")

def traced_tool_wrapper(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        role = user_role.get()
        write_tools = ["update_cafeteria_menu", "add_campus_event"]
        
        # Intercept and block write operations for non-admins
        if fn.__name__ in write_tools and role != "admin":
            steps = request_steps.get()
            if steps is not None:
                steps.append(f"⚠️ [Blocked] Tool '{fn.__name__}' execution rejected (Permission Denied for Student).")
            return f"Error: Permission Denied. Only users logged in with the 'admin' profile are authorized to modify cafeteria menus or add campus events."
            
        steps = request_steps.get()
        if steps is not None:
            steps.append(f"⚡ [Tool Call] Invoking tool '{fn.__name__}'")
            if kwargs:
                param_strs = [f"{k}={v}" for k, v in kwargs.items()]
                steps.append(f"📥 [Params] {', '.join(param_strs)}")
        
        # Execute the actual tool function
        res = fn(*args, **kwargs)
        
        if steps is not None:
            # Detect URLs explored by the tool (e.g. Koha catalog links, official PDF URLs)
            urls = re.findall(r'(https?://[^\s\'"()\]]+)', str(res))
            for url in urls:
                # Clean trailing symbols
                clean_url = url.rstrip(').,')
                steps.append(f"🔗 [Exploring Link] {clean_url}")
            steps.append(f"✅ [Completed] '{fn.__name__}' successfully finished.")
        return res
    return wrapper

# 2. DYNAMIC TOOL EXTRACTOR
# Pull the raw python functions directly out of the FastMCP app instances.
# This keeps your code clean and dynamic if you add more tools later!
native_tools = []
for mcp_app in [academics_mcp, cafeteria_mcp, events_mcp, library_mcp]:
    # Style 1: Official mcp SDK FastMCP
    tool_manager = getattr(mcp_app, "_tool_manager", None)
    if tool_manager and hasattr(tool_manager, "list_tools"):
        for tool in tool_manager.list_tools():
            if hasattr(tool, "fn"):
                native_tools.append(traced_tool_wrapper(tool.fn))
        continue
        
    # Style 2: Third-party fastmcp package
    provider = getattr(mcp_app, "_local_provider", None)
    if provider and hasattr(provider, "_components"):
        for comp in provider._components.values():
            if hasattr(comp, "fn"):
                native_tools.append(traced_tool_wrapper(comp.fn))  # Extract the pure Python function

print(f"[CAMPUS TOOLS] Successfully registered {len(native_tools)} native campus tools into memory.")

class Message(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    prompt: str
    history: list[Message] = []
    role: str = "student"

@app.post("/api/chat")
async def ask_integrated_campus_ai(payload: ChatPayload):
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    # Initialize request-local context variables
    steps = ["🧠 Analyzing query patterns..."]
    request_steps.set(steps)
    user_role.set(payload.role.strip().lower())
    
    try:
        # Build contents from history and current prompt
        contents = []
        for msg in payload.history:
            role_val = "user" if msg.role == "user" else "model"
            contents.append(
                genai.types.Content(
                    role=role_val,
                    parts=[genai.types.Part.from_text(text=msg.content)]
                )
            )
        contents.append(
            genai.types.Content(
                role="user",
                parts=[genai.types.Part.from_text(text=payload.prompt)]
            )
        )

        # Get dynamic current date info
        from datetime import datetime
        now = datetime.now()
        current_date_str = now.strftime("%A, %B %d, %Y")
        current_year = now.year
        
        # Infer the correct next semester name and year dynamically
        if now.month <= 6:
            next_sem = "Autumn"
            next_sem_year = f"{current_year}"
            next_sem_cycle = f"{current_year}-{str(current_year+1)[2:]}"
        else:
            next_sem = "Spring"
            next_sem_year = f"{current_year + 1}"
            next_sem_cycle = f"{current_year}-{str(current_year+1)[2:]}"

        steps.append("🚀 Dispatching request to Gemini model...")
        
        # 3. Call Gemini using the clean asynchronous engine (.aio)
        # We pass our list of pure Python functions directly into tools!
        response = await gemini_client.aio.models.generate_content(
            model="gemma-4-31b-it",
            contents=contents,
            config=genai.types.GenerateContentConfig(
                system_instruction=(
                    "You are the master IIT Roorkee Campus Intelligence Engine. You have access to "
                    "specialized tools across four campus pillars: academics, cafeteria, events, and library. "
                    "When a student asks a question, select the appropriate tool and invoke it automatically.\n"
                    f"For temporal queries (e.g., 'next semester', 'today', 'this week'), utilize the current date context: "
                    f"Today is {current_date_str}. The 'next semester' starting after the current date is the {next_sem} Semester {next_sem_year} (academic cycle {next_sem_cycle}). "
                    "If details like the program track or year (e.g. B.Tech, UG, MBA, etc.) are missing from the query, "
                    "check the previous conversation history first to see if the student already specified them. "
                    "If they are not in the history, infer reasonable defaults: "
                    f"use 'regular' for the program track, and '{current_year}' for the current/next academic cycle. "
                    "Proactively call the tools with these inferred defaults instead of asking the user for clarification."
                ),
                temperature=0.2,
                tools=native_tools  # Handing over pure Python callables
            )
        )
        
        steps.append("✨ Formulating final response...")
        
        # If the model successfully processed everything, return the text block
        if response.text:
            return {"status": "success", "reply": response.text, "steps": steps}
        else:
            return {
                "status": "success", 
                "reply": "ℹ️ Gemini processed your request but returned an empty response block.",
                "steps": steps
            }
            
    except Exception as e:
        steps.append(f"❌ [CRASH] Encountered error: {str(e)}")
        print(f"[ERROR] Gateway Pipeline Error: {str(e)}")
        return {
            "status": "success",
            "reply": "⚠️ I'm sorry, but I am currently unable to fetch the details for your query due to a temporary connection or API limit issue. Please try again in a few moments.",
            "steps": steps
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)