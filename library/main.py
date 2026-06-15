import urllib.parse
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from fastmcp import FastMCP
import requests
# 1. Initialize the FastMCP Server instance for the Library
mcp = FastMCP("library")
KOHA_BASE_URL = "http://opac.mgcl.iitr.ac.in"
KOHA_SEARCH_URL = f"{KOHA_BASE_URL}/cgi-bin/koha/opac-search.pl"

@mcp.tool()
def search_library_books(query: str) -> str:
    """
    Searches the Central Library live catalog for books matching a keyword and returns tracking links.
    
    Args:
        query (str): The book title, topic, or author keyword to search for (e.g., 'linear algebra', 'chemical').
    """
    params = {
        "idx": "",
        "q": query.strip(),
        "item_limit": "",
        "weight_search": "1",
        "format": "rss2" # <-- Fetches the clean, blazing-fast API data stream
    }
    
    try:
        response = requests.get(KOHA_SEARCH_URL, params=params, timeout=10)
        if response.status_code != 200:
            return f"❌ Unable to reach the library server (Status Code: {response.status_code})."
        
        root = ET.fromstring(response.content)
        items = root.findall(".//item")
        
        if not items:
            return f"📚 No records found matching '{query}' in the central catalog."
            
        output = [f"📚 **Search Results for '{query}':**\n"]
        for idx, item in enumerate(items[:5], 1):
            title = item.find("title").text if item.find("title") is not None else "Unknown Title"
            link = item.find("link").text if item.find("link") is not None else ""
            description = item.find("description").text if item.find("description") is not None else ""
            
            desc_clean = description.replace("\n", " ").strip() if description else "No details available."
            
            output.append(
                f"{idx}. 📖 **{title}**\n"
                f"   📝 Details: {desc_clean}\n"
                f"   🔗 Tracking Link: {link}\n"
            )
        return "\n".join(output)
    except Exception as e:
        return f"❌ Error parsing the live stream: {str(e)}"


@mcp.tool()
def get_book_availability(detail_url: str) -> str:
    """
    Fetches real-time availability status, shelf locations, or checkout states inside a book's tracking link.
    
    Args:
        detail_url (str): The full tracking URL of the book record returned from search_library_books.
    """
    try:
        response = requests.get(detail_url, timeout=10)
        if response.status_code != 200:
            return "❌ Unable to open the book's detail page."
            
        soup = BeautifulSoup(response.text, "html.parser")
        page_text = soup.get_text()
        
        # Instantly handle empty listings/digital records
        if "No physical items for this record" in page_text:
            return "ℹ️ Status: This record has no physical items available on library shelves (it may be an e-book or digital reference)."
            
        # Target Koha's native holdings tables layout
        holdings_table = soup.find("table", {"id": "holdingst"}) or soup.find("table", class_="table")
        if not holdings_table:
            return "🔍 Record found, but no physical item status table could be mapped."
            
        rows = holdings_table.find_all("tr")
        if len(rows) <= 1:
            return "ℹ️ The physical items table is currently empty for this record."
            
        headers = [th.get_text().strip() for th in rows[0].find_all(["th", "td"])]
        status_report = ["📊 **Live Shelf Availability Details:**"]
        
        for row in rows[1:]:
            cols = [td.get_text().strip() for td in row.find_all("td")]
            if not cols:
                continue
            
            item_details = []
            for h, val in zip(headers, cols):
                if h and val:
                    val_clean = " ".join(val.split())
                    item_details.append(f"**{h}**: {val_clean}")
            status_report.append(f" 📍 {', '.join(item_details)}")
            
        return "\n".join(status_report)
        
    except Exception as e:
        return f"❌ Error checking real-time availability: {str(e)}"
    
def main():
    # Initialize and run the server
    mcp.run()


if __name__ == "__main__":
    main()
