import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const server = new McpServer({
  name: "jokesMCP",
  description: "A server that provides jokes (and weather!)",
  version: "1.0.0",
  tools: [
    {
      name: "get-chuck-joke",
      description: "Get a random Chuck Norris joke",
      parameters: {},
    },
    {
      name: "get-chuck-categories",
      description: "Get all available categories for Chuck Norris jokes",
      parameters: {},
    },
    {
      name: "get-dad-joke",
      description: "Get a random dad joke",
      parameters: {},
    },
    {
      name: "get-yo-mama-joke",
      description: "Get a random Yo Mama joke",
      parameters: {},
    },
    {
      name: "get-weather",
      description: "Get current weather information for a given city",
      parameters: {
        city: {
          type: "string",
          description: "Name of the city, e.g. 'New York'",
          required: true, // Copilot must obtain this from the user
        },
      },
    },
  ],
});

// Get Chuck Norris joke tool
const getChuckJoke = server.tool(
  "get-chuck-joke",
  "Get a random Chuck Norris joke",
  async () => {
    const response = await fetch("https://api.chucknorris.io/jokes/random");
    const data = await response.json();
    return {
      content: [{ type: "text", text: data.value }],
    };
  }
);

// Get Chuck Norris joke categories tool
const getChuckCategories = server.tool(
  "get-chuck-categories",
  "Get all available categories for Chuck Norris jokes",
  async () => {
    const response = await fetch("https://api.chucknorris.io/jokes/categories");
    const data = await response.json();
    return {
      content: [{ type: "text", text: data.join(", ") }],
    };
  }
);

// Get Dad joke tool
const getDadJoke = server.tool(
  "get-dad-joke",
  "Get a random dad joke",
  async () => {
    const response = await fetch("https://icanhazdadjoke.com/", {
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    return {
      content: [{ type: "text", text: data.joke }],
    };
  }
);

// Get Yo Mama joke tool
const getYoMamaJoke = server.tool(
  "get-yo-mama-joke",
  "Get a random Yo Mama joke",
  async () => {
    const response = await fetch(
      "https://www.yomama-jokes.com/api/v1/jokes/random"
    );
    const data = await response.json();
    return {
      content: [{ type: "text", text: data.joke }],
    };
  }
);

// Get Weather tool (fixed)
const getWeather = server.tool(
  "get-weather",
  "Get current weather information for a given city",
  async ({ city }: { city?: string }) => {
    if (!city) {
      // Extra safety: should rarely happen because `required: true`
      return {
        content: [
          { type: "text", text: "Please specify a city name (e.g. London)." },
        ],
      };
    }

    try {
      const response = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1`
      );
      const data = await response.json();
      const current = data.current_condition?.[0];
      if (!current) throw new Error("No weather data");

      const desc = current.weatherDesc?.[0]?.value;
      const tempC = current.temp_C;
      const tempF = current.temp_F;
      const humidity = current.humidity;
      const wind = current.windspeedKmph;

      return {
        content: [
          {
            type: "text",
            text: `Weather in ${city}: ${desc}. Temp ${tempC} °C (${tempF} °F), Humidity ${humidity} %, Wind ${wind} km/h.`,
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `Sorry—couldn’t fetch weather for “${city}”.`,
          },
        ],
      };
    }
  }
);

const app = express();

/* Support multiple simultaneous SSE connections */
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (req: Request, res: Response) => {
  const host = req.get("host");
  const fullUri = `https://${host}/jokes`;
  const transport = new SSEServerTransport(fullUri, res);

  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

app.post("/jokes", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

app.get("/", (_req, res) => {
  res.send("The Jokes MCP server is running!");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
