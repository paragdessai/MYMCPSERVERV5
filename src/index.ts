import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const server = new McpServer({
  name: "jokesMCP",
  description: "A server that provides jokes (and weather!)",
  version: "1.0.0",
  tools: [
    { name: "get-chuck-joke",       description: "Get a random Chuck Norris joke",       parameters: {} },
    { name: "get-chuck-categories", description: "Get all Chuck Norris joke categories", parameters: {} },
    { name: "get-dad-joke",         description: "Get a random dad joke",                parameters: {} },
    { name: "get-yo-mama-joke",     description: "Get a random Yo-Mama joke",            parameters: {} },
    {
      name: "get-weather",
      description: "Get current weather information for a given city",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name, e.g. \"New York\"" },
        },
        required: ["city"],
      },
    },
  ],
});

/* ───── Joke tool handlers (description arg removed) ───── */
server.tool("get-chuck-joke", async () => {
  const { value } = await fetch("https://api.chucknorris.io/jokes/random").then(r => r.json());
  return { content: [{ type: "text", text: value }] };
});

server.tool("get-chuck-categories", async () => {
  const data = await fetch("https://api.chucknorris.io/jokes/categories").then(r => r.json());
  return { content: [{ type: "text", text: data.join(", ") }] };
});

server.tool("get-dad-joke", async () => {
  const { joke } = await fetch("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } }).then(r => r.json());
  return { content: [{ type: "text", text: joke }] };
});

server.tool("get-yo-mama-joke", async () => {
  const { joke } = await fetch("https://www.yomama-jokes.com/api/v1/jokes/random").then(r => r.json());
  return { content: [{ type: "text", text: joke }] };
});

/* ───── Weather tool handler (description arg removed) ───── */
server.tool("get-weather", async ({ city }: { city: string }) => {
  const data = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`).then(r => r.json());
  const cur  = data.current_condition?.[0];
  if (!cur) {
    return { content: [{ type: "text", text: `Sorry—couldn’t fetch weather for “${city}”.` }] };
  }

  const reply =
    `Weather in ${city}: ${cur.weatherDesc?.[0]?.value}. ` +
    `Temp ${cur.temp_C} °C (${cur.temp_F} °F), ` +
    `Humidity ${cur.humidity} %, Wind ${cur.windspeedKmph} km/h.`;

  return { content: [{ type: "text", text: reply }] };
});

/* ───── Express + SSE plumbing ───── */
const app = express();
const transports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req: Request, res: Response) => {
  const transport = new SSEServerTransport(`https://${req.get("host")}/jokes`, res);
  transports[transport.sessionId] = transport;
  res.on("close", () => delete transports[transport.sessionId]);
  await server.connect(transport);
});

app.post("/jokes", async (req: Request, res: Response) => {
  const transport = transports[req.query.sessionId as string];
  transport ? await transport.handlePostMessage(req, res)
            : res.status(400).send("No transport found for sessionId");
});

app.get("/", (_req, res) => res.send("The Jokes MCP server is running!"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server is running at http://localhost:${PORT}`));
