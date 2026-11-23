## Building an AI Agent with MCP and a Local LLM

### What I was trying to understand?
One of my peers was working on report automation where he was getting data from one agent and then using JIRA MCP, creating tickets for the teams. I was flabbergasted — this is some kind of automation which I have never used. I know how LLMs work, AI agents, the OpenAI hype but never seen someone using it in front of me. I became curious, which led to this blog.

### From the beginning
LLM is a stateless AI system trained on millions and billions of data. It can only answer what it knows from the training dataset, nothing after that. This means if its final training happened on 28th Feb 2026, it will not know what happened after that.

But if you have ChatGPT, Claude or Gemini and you query "What is the current time in India?" it will show the correct answer. How? Let's understand it with an example.

I have a LLM running locally on my machine and I have asked the same query. The `>>>` below is Ollama's interactive prompt.
```bash
> ollama list
NAME             ID              SIZE      MODIFIED
granite4.2:3b    40577dc168a3    2.2 GB    41 hours ago
qwen3.5:0.8b     f3817196d142    1.0 GB    8 weeks ago

> ollama
>>> what is the current time in india?

As an AI model, I do not have direct access to live real-time clock data or the ability to check your specific location's current time without a live internet connection or device access.

However, India observes **Indian Summer Time (IST)**.

*   **Standard Time:** During summer seasons, India observes IST which is UTC+5:30 hours ahead of Greenwich Mean Time (GMT).
*   **Winter Season:** In winter, India's time zone changes to 12 hours ahead of GMT (UTC+12) depending on the season.

For precise current times for specific devices or regions, you may want to check your local clock or device.
```

Just look at the output, it does not have access to a clock and is not able to answer the query. It even hallucinated — India does **not** switch to UTC+12 in winter. India is UTC+5:30 (IST) year-round. This is a great example of why LLMs need access to real data sources.

All I have to do is to provide access to clock and then LLM will be able to answer. HOW? **MCP Server**

### MCP Server and Client
Suppose you are tasked to create a web page that have a button and when clicked it shows the current date and time. How can you design that?
From frontend all you need to call a API and shows the formatted response on the web page.

```js
// curl https://time.now/developer/api/time?timezone=Asia%2FKolkata

async function getDateTime() {
  const apiUrl = "https://time.now/developer/api/time?timezone=Asia%2FKolkata";
  const response = await fetch(apiUrl);
  const data = await response.json();
  return data.datetime;
}

// <button onClick="getDateTime().then(dt => alert(dt))">Get IST time</button>
```
APIs typically communicate over HTTP/HTTPS.
But LLMs are stateless models — they don't speak any protocol. The applications hosting them need a standard way to discover and call tools at runtime. To solve this, a new protocol was created — **Model Context Protocol**. [MCP](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro) allows LLMs to use these custom functions/methods/classes written in high level languages such as Python, Go, and so on. It is an open-source standard for connecting AI applications to external systems.
Think of it as a backend API connected to your frontend application (the host — Claude Desktop, Kiro, etc.), where the LLM is the brain deciding which tool to call.

- MCP Hosts → The application the user interacts with (Claude Desktop, Kiro, Codex, VS Code). It creates and manages MCP clients, enforces security policies, and coordinates the LLM.
- MCP Clients → Created by the host, each client maintains a 1:1 connection with exactly one MCP server. It routes messages between the host and the server.
- MCP Servers → Expose tools, resources, and prompts that LLMs can use. They operate independently and can be local processes or remote services.

![MCP Architecture](blogs/mcp_architecture.svg)

### Examples
- Rest API using FastAPI (so that you can correlate later with MCP server). Normally this is what we call backend.
```python

from fastapi import FastAPI
import httpx

app = FastAPI()


@app.get("/")
async def greetings():
    return {"message": "Hello World"}

@app.get("/time")
async def time(timezone="Asia/Kolkata"):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://time.now/developer/api/time?timezone={timezone}")
        return response.json()["datetime"]

# On Terminal
>  uv run fastapi dev
> curl http://127.0.0.1:8000

```
#### MCP Server
**Let's understand how MCP server is written**
Prerequisites
- Install Python
- Install uv or pip
- Install Node.js (provides node, npm and npx commands)
- Make sure each of these commands are available in your terminal. If not, check your $PATH variable
```bash
> uv add "mcp[cli]"
```

```python
# server_mcp.py

from mcp.server import MCPServer
import httpx

mcp = MCPServer("Demo")

@mcp.tool()
def greeting(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

@mcp.tool()
async def time(timezone: str = "Asia/Kolkata"):
    """Get current date/time for a timezone."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://time.now/developer/api/time?timezone={timezone}")
        return response.json()["datetime"]
```

```bash
> uv run mcp dev server_mcp.py
```
- Here tools mean the objects a LLM can call on runtime based on requirement.
- `@mcp.tool()` is a decorator which adds a Python function as a tool that LLMs can use on the fly.
- As soon as you hit `uv run mcp dev server_mcp.py` an [MCP Inspector](https://github.com/modelcontextprotocol/inspector#mcp-inspector) web page opens in your browser that allows you to connect with your MCP server, browse tools, resources, and prompts. It is similar to Swagger if we correlate with Rest APIs.
- AI agents such as Claude Desktop, Kiro, Codex, Cursor and so on can connect by configuring their MCP settings and adding a block similar to this.
```json
"demo-mcp": {
      "command": "uv",
      "args": [
        "run",
        "mcp",
        "run",
        "server_mcp.py"
      ],
      "cwd": "/app/si"
    }
```
- The above JSON is for IDEs and Claude Desktop. To use this MCP server via a Python script, run the below command.
- To use it via [HTTP](https://py.sdk.modelcontextprotocol.io/client/) run `uv run mcp run --transport streamable-http server_mcp.py`
```bash
> uv run mcp run --transport streamable-http server_mcp.py
INFO:     Started server process [91714]
INFO:     Waiting for application startup.
[11/23/26 16:07:23] INFO     StreamableHTTP session manager started
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     127.0.0.1:60770 - "POST /mcp HTTP/1.1" 200 OK
```
#### MCP Client
- To use tools defined in MCP Server, you must have a client. For AI SaaS use the above MCP JSON. Below is the Python script example.

```python

# client_mcp.py

import anyio

from mcp import Client


async def main() -> None:
    async with Client("http://localhost:8000/mcp") as client:
        print(client.server_info)
        print(client.server_capabilities)
        print(client.protocol_version)
        print(client.instructions)


if __name__ == "__main__":
    anyio.run(main)
```

```bash
> uv run client_mcp.py
name='Demo' title=None version='' description=None website_url=None icons=None
experimental=None logging=None prompts=PromptsCapability(list_changed=True) resources=ResourcesCapability(subscribe=True, list_changed=True) tools=ToolsCapability(list_changed=True) completions=None extensions=None tasks=None
2026-07-28
None
```
**NOTE:** For a tool to be used by an LLM, you must define a proper name, description (docstring) and parameters (input schema). This way the LLM can accurately understand what is needed. I have now updated my server's tools.

**Updated Snippet**
```python
#### server_mcp.py ####
from mcp.server import MCPServer
import httpx

mcp = MCPServer(
    "Demo",
    version="1.0.0",
    description="A demo MCP server with greeting and time tools.",
    instructions="Use the greeting tool to greet someone, and the time tool to get current date/time for a timezone.",
)

@mcp.tool()
def greeting(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

@mcp.tool()
async def time(timezone: str = "Asia/Kolkata"):
    """It takes timezone as a input and get the date and time from time.now api. Then returns the Datetime"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://time.now/developer/api/time?timezone={timezone}")
        return response.json()["datetime"]


#### client_mcp.py ####
import anyio

from mcp import Client


async def main() -> None:
    async with Client("http://localhost:8000/mcp") as client:
        print("#"*5," MCP Server Info ","#"*5)
        print(client.server_info)
        print(client.server_capabilities)
        print(client.protocol_version)
        print(client.instructions)
        result = await client.list_tools()
        print("#"*5," MCP Server Tools Info ","#"*5)
        for tool in result.tools:
            print(tool.name)
            print(tool.title)
            print(tool.description)
            print(tool.input_schema)


if __name__ == "__main__":
    anyio.run(main)

```
- Checkout how you can call tools from client_mcp.py [here](https://py.sdk.modelcontextprotocol.io/client/#calling-a-tool)

**Now we understood how MCP works. Let's provide the tools to LLM.**

#### LLM With MCP

- I'm running local LLM using Ollama and it is available over http on port 11434 `http://localhost:11434/api/chat`
```python
# --- Ollama Configuration ---
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "granite4.2:3b"  # Make sure this matches `ollama list`
NUM_CTX = 32768         # Important: accessibility snapshots can be large
```
- NUM_CTX: It means context size. Each model has its own context size, granite4.2:3b has 128k. But we should remember what context actually stores. It stores user prompt, system prompt and the output it has given. If each message is fresh, meaning it has no correlation with the previous messages, then we should be good. Otherwise you need to make sure how context is getting handled and cleared.

**NOTE:** The agent code below uses `ClientSession` and `stdio_client` from the v1 SDK to show what happens behind the scenes — the raw transport setup, the manual initialization handshake, and the explicit read/write streams. For production use, prefer `Client` from v2 (`from mcp import Client`) which wraps all of this in a single object. `ClientSession` is deprecated in v2.

**Steps**
1. Connect to LLM from Python Script
```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "granite4.2:3b"

async def main():
    # Point to our server_mcp.py via stdio
    server_params = StdioServerParameters(
        command="uv",
        args=["run", "mcp", "run", "server_mcp.py"],
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools_resp = await session.list_tools() # this will list all the tools our server have

if __name__ == "__main__":
    asyncio.run(main())
```

**StdioServerParameters:** StdioServerParameters is a Pydantic data model (BaseModel) that holds the instructions for launching the MCP server subprocess. It does not execute anything on its own.

**stdio_client:** stdio_client is an @asynccontextmanager function that takes a **StdioServerParameters** instance as input and handles the entire lifecycle of the server process.
- Launches the server process and sets up background reader/writer tasks (stdout_reader and stdin_writer) to exchange newline-delimited JSON-RPC messages.

- Yields (read_stream, write_stream) so an MCP client session can communicate with the server.

- Enforces a clean shutdown sequence (closes stdin, waits for flushes, and terminates the process tree) even if the caller is cancelled.

**ClientSession:** This is a class that handles sessions in v1. In v2, the Client class (client_mcp.py) replaces ClientSession for most use cases — it handles the transport setup and initialization in one step.

##### Provide tools to Ollama
```python

def mcp_tools_to_ollama(mcp_tools) -> list[dict]:
    """Convert MCP tool list into Ollama's tool-calling format."""
    ollama_tools = []
    for tool in mcp_tools:
        schema = dict(
            getattr(tool, "inputSchema", None)
            or getattr(tool, "input_schema", {})
        )
        ollama_tools.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description or "",
                "parameters": schema,
            },
        })
    return ollama_tools

async def main():
    ...
    tools_resp = await session.list_tools() # this will list all the tools our server have
    ollama_tools = mcp_tools_to_ollama(tools_resp.tools)

```
- As we discussed, an LLM needs three things from a tool: name, description and input schema.

##### Call Ollama
```python

import httpx # You can use ollama python module too
async def call_ollama(messages: list[dict], tools: list[dict]) -> dict:
    """Send messages + tools to Ollama and return the assistant message."""
    payload = {
        "model": MODEL,
        "messages": messages,
        "tools": tools, # here tools are passed to LLM
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(OLLAMA_URL, json=payload)
        resp.raise_for_status()
        return resp.json()["message"]

```

##### Define System Prompt and Take User Prompt
```python

# ---------------------------------------------------------------------------
# 4. AGENT LOOP — the core orchestration
# ---------------------------------------------------------------------------
# One user prompt can trigger multiple rounds:
#   LLM decides to call a tool → we execute it via MCP → feed result back → repeat
# The loop ends when the LLM responds with plain text (no tool calls).

async def agent_loop(session: ClientSession, tools: list[dict], user_prompt: str):
    """Run one prompt through the LLM, handling any tool calls via MCP."""

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant with access to tools. "
                "Use the tools when the user's question requires them. "
                "Otherwise, answer directly from your knowledge."
            ),
        },
        {"role": "user", "content": user_prompt},
    ]

    # Allow up to 5 tool-call rounds per prompt (safety cap)
    for step in range(5):
        # Ask the LLM
        assistant_msg = await call_ollama(messages, tools)
        messages.append(assistant_msg)

        # Check if the LLM wants to call any tools
        tool_calls = assistant_msg.get("tool_calls")
        if not tool_calls:
            # No tool calls — this is the final text answer
            print(f"\nAssistant: {assistant_msg.get('content', '')}")
            return

        # Execute each tool call through MCP
        for call in tool_calls:
            fn_name = call["function"]["name"]
            fn_args = call["function"]["arguments"]

            print(f"  [Tool call] {fn_name}({json.dumps(fn_args)})")

            # Call the tool on the MCP server
            result = await session.call_tool(fn_name, arguments=fn_args)

            # Extract text content from the MCP response
            tool_output = "\n".join(
                c.text for c in result.content if c.type == "text"
            )
            print(f"  [Tool result] {tool_output}")

            # Feed the tool result back to the LLM
            messages.append({
                "role": "tool",
                "name": fn_name,
                "content": tool_output,
            })

    # If we exhausted all rounds, ask LLM to wrap up
    messages.append({"role": "user", "content": "Summarize what you found."})
    final = await call_ollama(messages, tools=[])
    print(f"\nAssistant: {final.get('content', '')}")


async def main():
    ...
            while True:
                user_input = input("You: ").strip()
                if not user_input or user_input.lower() in {"exit", "quit"}:
                    break
                await agent_loop(session, ollama_tools, user_input)
                print("-" * 40)
```

**agent_loop:** This function takes the session created, tools we got from our mcp server and user prompt and does the following:
- Message contains both System Prompt and User Prompt.
- Currently the LLM has been capped to run only 5 tool-call rounds. After 5 it will stop. Similar to timeouts.
- *assistant_msg* is the response object after providing tools to the LLM.
- We are also checking whether it called any tools or not. If yes, print the name and parameters passed.
- Finally, we ask the LLM again to summarize by sending the whole message history if steps went more than threshold, since LLMs do not remember what we have talked about. That's why context size matters.

**How one round actually plays out:** Say you type "What is the current time in California?" — the LLM receives your prompt along with the list of available tools (greeting and time). It looks at the tool descriptions and decides: this is a time question, so I should call the `time` tool with `{"timezone": "America/Los_Angeles"}`. The agent code catches that tool call, sends it to the MCP server via `session.call_tool()`, and the server executes the actual HTTP request to the time API. The result (`2026-11-23T04:27:22...`) comes back through MCP to the agent, which appends it to the message history as a tool result. Now the LLM is called again — this time it sees the raw timestamp in its context and knows it doesn't need another tool call. It formats a human-friendly answer: "The current time in California is 4:27 AM on November 23, 2026." That's one complete round. The loop exists because some questions need multiple tool calls before the LLM has enough information to answer.

##### Output
- General Question
```bash
> uv run agent.py
Connected to MCP server. Found 2 tools:
  - greeting: Greet someone by name.
  - time: It takes timezone as a input and get the date and time from time.now api. Then returns the Datetime

You: what is a LLM

Assistant: A **LLM** (Large Language Model) is an artificial‑intelligence system designed to understand and generate human‑like text. It’s trained on huge amounts of written language data, which lets it produce responses that are coherent, context‑aware, and relevant to many kinds of tasks—such as answering questions, writing stories, summarizing documents, translating languages, and more.

In short, an LLM is a sophisticated language‑focused model that learns patterns in how words and sentences are used, enabling it to generate or modify text based on the input it receives.
```
- Tool related question
```bash
> uv run agent.py
You: what is the current time in california
  [Tool call] time({"timezone": "America/Los_Angeles"})
  [Tool result] 2026-11-23T04:27:22.641820-08:00

Assistant: The current time in California (Los Angeles) is **4:27:22 AM on November 23, 2026**.
```

**We have created an AI Agent which is basically LLM + MCP + Loop**

The complete `agent.py` is available on GitHub: https://github.com/navsin189/superintelligence/tree/main

##### You can use open-source MCP servers too
```python
server_params = StdioServerParameters(
        command="uvx",
        args=["duckduckgo-mcp-server"],
    )
```
Checkout https://github.com/navsin189/superintelligence/blob/main/web_search_mcp.py

### What's Next?
This was a minimal agent — one server, two tools, a local LLM. From here you can:
- Add more MCP servers (databases, APIs, file systems) and let the LLM pick between them
- Add memory/conversation history so the agent remembers previous messages
- Swap in a larger model for better tool-calling accuracy
- Try connecting your server to Claude Desktop or Kiro instead of a custom client

#### References
- [modelcontextprotocol.io](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro)
- [MCP Python SDK](https://py.sdk.modelcontextprotocol.io/)