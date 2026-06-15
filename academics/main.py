import io
import re
import urllib.parse
from datetime import datetime
from functools import lru_cache
from bs4 import BeautifulSoup
from fastmcp import FastMCP
from pypdf import PdfReader
import requests

mcp = FastMCP("academics")
PARENT_PORTAL_URL = "https://iitr.ac.in/Academics/Academic%20Calendar.html"

# Month translation dictionary for text matches
MONTHS_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
}

@lru_cache(maxsize=16)
def get_live_pdf_url(semester: str, track_type: str, year: str) -> str:
    response = requests.get(PARENT_PORTAL_URL, timeout=10)
    if response.status_code != 200:
        raise RuntimeError("Could not load the academic portal index.")
    
    soup = BeautifulSoup(response.text, "html.parser")
    clean_year = str(year).strip()
    
    for elem in soup.find_all(lambda tag: tag.has_attr("href") or tag.has_attr("onclick")):
        href = elem.get("href")
        onclick = elem.get("onclick")
        
        target_url = None
        if href:
            target_url = href
        elif onclick:
            match = re.search(r"window\.location\s*=\s*['\"]([^'\"]+\.pdf)['\"]", onclick) or \
                    re.search(r"['\"]([^'\"]+\.pdf)['\"]", onclick)
            if match:
                target_url = match.group(1)
                
        if not target_url:
            continue
            
        text = elem.get_text().lower()
        target_url_lower = target_url.lower()
        
        if clean_year in target_url or clean_year in text:
            if semester in target_url_lower or semester in text:
                if track_type == "regular" and "other than mba" in text:
                    return urllib.parse.urljoin(PARENT_PORTAL_URL, target_url)
                elif track_type == "mba" and "mba" in text:
                    return urllib.parse.urljoin(PARENT_PORTAL_URL, target_url)
                    
    raise FileNotFoundError(f"Could not locate the {clean_year} {semester} {track_type} document.")

@lru_cache(maxsize=8)
def download_and_extract_pdf(url: str) -> list:
    """Downloads the PDF and extracts its text lines, returning a list of (page_idx, line)."""
    response = requests.get(url, timeout=15)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to download PDF from {url}")
    
    pdf_stream = io.BytesIO(response.content)
    reader = PdfReader(pdf_stream)
    
    extracted_lines = []
    for page_idx, page in enumerate(reader.pages, 1):
        text_content = page.extract_text()
        if not text_content:
            continue
        for line in text_content.split("\n"):
            clean_line = line.strip()
            if clean_line:
                extracted_lines.append((page_idx, clean_line))
    return extracted_lines

def parse_query_date(search_keyword: str, default_year: str) -> datetime.date:
    """Attempts to parse natural text like 'June 13' or '13.06' into a standard date object."""
    clean_kw = search_keyword.lower().strip()
    
    # Match pattern: 'June 13' or '13 June'
    date_match = re.search(r'([a-z]{3})[a-z]*\s*(\d+)|(\d+)\s*([a-z]{3})[a-z]*', clean_kw)
    if date_match:
        groups = date_match.groups()
        month_str = groups[0] or groups[3]
        day_str = groups[1] or groups[2]
        if month_str in MONTHS_MAP:
            return datetime(int(default_year), MONTHS_MAP[month_str], int(day_str)).date()
            
    # Match pattern: '13.06' or '13.06.2026'
    dot_match = re.search(r'(\d{2})\.(\d{2})(?:\.(\d{4}))?', clean_kw)
    if dot_match:
        groups = dot_match.groups()
        year_val = groups[2] if groups[2] else default_year
        return datetime(int(year_val), int(groups[1]), int(groups[0])).date()
        
    return None

def check_date_in_line(line: str, target_date: datetime.date) -> bool:
    """Checks if a specific target date falls on or inside the dates mentioned in a text line."""
    if not target_date:
        return False
        
    line_lower = line.lower()
        
    # Find all dot-notation dates in the line (e.g., 10.09.2026)
    dot_dates = re.findall(r'(\d{2})\.(\d{2})\.(\d{4}|\d{2})', line)
    if dot_dates:
        parsed_dates = []
        for d in dot_dates:
            yr = int(d[2])
            if yr < 100:
                yr += 2000
            parsed_dates.append(datetime(yr, int(d[1]), int(d[0])).date())
        
        # If it's a range (e.g., 10.09.2026 - 15.09.2026)
        if len(parsed_dates) >= 2:
            return parsed_dates[0] <= target_date <= parsed_dates[1]
        # If it's a single date match
        elif len(parsed_dates) == 1:
            return target_date == parsed_dates[0]

    # Handle text summaries on page 2 (e.g., "September 10 – 15, 2026")
    for month_name, month_num in MONTHS_MAP.items():
        if month_name in line_lower and target_date.month == month_num:
            # Look for ranges near the month: e.g. "September 10 – 15"
            pattern1 = rf'{month_name}[a-z]*\s+(\d+)(?:\s*[–\-—]\s*(\d+))?'
            match1 = re.search(pattern1, line_lower)
            if match1:
                start_day = int(match1.group(1))
                if match1.group(2):
                    end_day = int(match1.group(2))
                    if start_day <= target_date.day <= end_day:
                        return True
                elif target_date.day == start_day:
                    return True
            
            # Look for ranges preceding the month: e.g. "10 – 15 September"
            pattern2 = rf'(\d+)(?:\s*[–\-—]\s*(\d+))?\s+{month_name}[a-z]*'
            match2 = re.search(pattern2, line_lower)
            if match2:
                start_day = int(match2.group(1))
                if match2.group(2):
                    end_day = int(match2.group(2))
                    if start_day <= target_date.day <= end_day:
                        return True
                elif target_date.day == start_day:
                    return True
    return False

@mcp.tool()
def search_academic_calendar(semester: str, year: str, program_track: str, search_keyword: str) -> str:
    """
    Scans the official calendar PDF rows dynamically. Handles explicit keyword tokens 
    (like 'Thomso') as well as smart date checking across tabular ranges.
    """
    sem = semester.lower().strip()
    track = program_track.lower().strip()
    
    try:
        live_url = get_live_pdf_url(sem, track, year)
        # Use our lru_cache-enabled extractor to avoid redundant network/processing latency
        extracted_lines = download_and_extract_pdf(live_url)
        
        # Parse the keyword to see if the user is checking a specific day
        target_date = parse_query_date(search_keyword, year)
        matched_milestones = []
        
        # Split keyword into lowercased tokens for robust phrase matching (e.g. physical + registration)
        kw_tokens = search_keyword.lower().strip().split()
        
        for page_idx, clean_line in extracted_lines:
            # Match condition 1: Word-token intersection (all query words must be present in the line)
            text_hit = all(token in clean_line.lower() for token in kw_tokens) if kw_tokens else False
            
            # Match condition 2: Smart date math hit (falls inside a range window)
            date_hit = check_date_in_line(clean_line, target_date)
            
            if text_hit or date_hit:
                # Clean up multi-space gaps caused by PDF table cells parsing horizontally
                scannable_line = re.sub(r'\s+', ' ', clean_line)
                matched_milestones.append(f"📍 [Page {page_idx}]: {scannable_line}")
                    
        if not matched_milestones:
            if target_date:
                return f"ℹ️ The calendar has no active deadlines, exams, or holidays listed for **{target_date}**."
            return f"ℹ️ No items found matching token string '{search_keyword}'."
            
        return "\n".join([
            f"📋 **Verified Calendar Matches for '{search_keyword}'**",
            f"🍂 Schedule: {sem.title()} Semester {year} ({track.upper()})",
            f"🔗 Live Document: {live_url}\n",
            "---"
        ] + list(set(matched_milestones)))
        
    except Exception as e:
        return f"❌ Automation pipeline processing failure: {str(e)}"
def main():
    # Initialize and run the server
    mcp.run()


if __name__ == "__main__":
    main()

