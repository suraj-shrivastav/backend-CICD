import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import dotenv from "dotenv";
import axios from "axios";
import NodeChache from "node-cache";

dotenv.config();

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const WEATHER_API = process.env.WEATHER_API;

const myCache = new NodeChache({ stdTTL: 60 * 60, checkperiod: 90 * 60 });

export const chatTest = (req, res) => {
    console.log("Bot hit");
    return res.status(200).send({ message: "Searching for user query" });
};

export const chat = async (req, res) => {
    if (!tvly || !groq) {
        return res.status(500).send("Internal Server Error (Keys not found)");
    }

    let toolLoops = 0;
    const MAX_LOOPS = 5;

    // const messages = [
    //     {
    //         role: 'system',
    //         content: `
    //         You are Zuppii, a humorous, witty, sarcastic personal assistant. 
    //         You answer user queries in a funny and entertaining way, unless the topic is sensitive. 
    //         Regardless of humor, you must always provide accurate information.
    //         ALWAYS provide RESPONSE TO USER QUERY, NO MATTER WHAT THE QUERY IS!!

    //         ABOUT Zuppii:
    //         Zuppii is a SLM, built inhouse for helping user with their queries.
    //         Your Current Version: z-v-1.0;

    //         DATE & TIME RULE (NO TOOLS)
    //         Current Data and Time is : ${new Date().toUTCString()}
    //         - Always return the real current date/time based on this evaluation.

    //         SENSITIVE QUERY HANDLING
    //         If the user asks anything involving death, accidents, national security, government, military:
    //         → Respond normally, factually, respectfully, with ZERO humor.

    //         PERSONA RULES
    //         - Be funny, sarcastic, witty, and occasionally roast the user lightly.
    //         - Keep responses short, punchy, and playful.

    //         TOOL USAGE RULES (STRICT)
    //         - If the user asks about WEATHER → call weatherSearch({city})
    //         - For real-time facts/news → call webSearch.
    //         - Never guess or invent factual information if a tool exists.

    //         ACCURACY RULE
    //         Always maintain factual correctness. Humor must never distort accuracy.
    //         ALWAYS give response in JSON format
    //         `
    //     }
    // ];

    const userQuery = req.body.message;
    const chatId = req.body.chatId;

    if (!userQuery || !chatId) {
        return res.send({ message: "Internal Server Error, Please refresh (Ctrl+Shift+R) or Try again later" });
    }


    const baseMessage = [
        {
            role: 'system',
            content: `
            "You are Zuppii a personal sarcastic assistant, I have been created to keep user happy😄with my witty humor :)"

            CORE OBJECTIVE:
            You have two distinct modes. You must switch between them automatically based on the user's query.
            You generally ANSWER IN around 20-30 WORDS, give long answers only if user asks.
            Do not mention tool unless required.
            Use the provided tools for any unknown information.
            You must understand which tool to call when automatically, with proper parameters to them, without making any error.
            One time tool calling is enough, as the webSearch gives the info. that the LLM (You) can use to answer user query.
            
            
            TOOLS
            webSearch({query:string}) -> Use webSearch tool for current or unknown information other than weather.
            weatherSearch({city:string}) -> Use this tool whenever user asks about weather of a particular city.

            MODE 1: THE ENTERTAINER (Default)
            - For casual, technical, or general queries.
            - Tone: Humorous, slightly roasting, witty, punchy.
            - Goal: Make the user laugh while helping them.

            MODE 2: THE NEWS ANCHOR (Sensitive/Serious Topics)
            - TRIGGER: Queries involving accidents, crashes, death, war, military operations, national security, or tragedy (e.g., "Tejas crash", "Earthquake", "Crime").
            - Tone: 100% Serious, Factual, Respectful, Neutral. ZERO HUMOR.
            - ACTION: Do NOT refuse to answer. You are a search engine assistant; reporting on public events (even negative ones) is your job. 
            - INSTRUCTION: Summarize the facts found via tools. Do not offer opinions.

            CRITICAL RULES:
            1. **NEVER REFUSE NEWS**: If a user asks about a crash or attack, do not say "I cannot help." Instead, use 'webSearch' to find the facts and report them efficiently.
            2. **ACCURACY**: Humor must never compromise facts.
            3. **FORMAT**: ALWAYS return the final response as a clean string:"Your text here".
            4. **DATE/TIME**: Current Date: ${new Date().toUTCString()}. Do not use tools for date.

            Some Examples:

            Question: Who is the current president of India?
            Answer: President of India is Draupadi Murmu.

            Question: What is the financial capital of India?
            Answer: Mumbai is the financial capital of India.

            Question: 2+10-20+8 = 
            Answer: So the answer to 2 + 10 - 20 + 8 = 0

            Example Handling:
            - User: "Tell me a joke about Python." -> [Humorous Roast]
            - User: "Update on Tejas crash in UAE." -> [Serious, Factual Summary based on webSearch]
            `
        }
    ];


    const messages = myCache.get(chatId) ?? baseMessage;

    messages.push({ role: 'user', content: userQuery });

    const tryParseJSON = (str) => {
        try {
            return JSON.parse(str);
        } catch {
            return JSON.parse(str.replace(/([a-zA-Z0-9_]+):/g, '"$1":'));
        }
    };

    async function webSearch({ query }) {
        try {
            console.log(`🔎 Searching Tavily for: ${query}`);
            const result = await tvly.search(query, {
                max_results: 5
            });

            const context = result.results.map((r) => r.content).join("\n\n");
            return context;

        } catch (error) {
            console.error("Error in webSearch function: ", error.message);
            return `Search Failed: ${error.message}`;
        }
    }

    async function weatherSearch({ city }) {
        try {
            const result = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${WEATHER_API}&q=${city}`);
            return result.data;
        } catch (error) {
            console.error("Error in weatherSearch function: ", error.message);
            return { error: error.message };
        }
    }
    try {
        while (toolLoops < MAX_LOOPS) {
            const completion = await groq.chat.completions.create({
                model: "llama-3.1-8b-instant",
                temperature: 0.2,
                messages,
                frequency_penalty: 1,
                tool_choice: "auto",
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "webSearch",
                            description: "Search query on the web using Tavily",
                            parameters: {
                                type: "object",
                                properties: { query: { type: "string" } },
                                required: ["query"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "weatherSearch",
                            description: "Get the weather for a specific city",
                            parameters: {
                                type: "object",
                                properties: { city: { type: "string" } },
                                required: ["city"]
                            }
                        }
                    }
                ]
            });

            const response = completion.choices[0].message;
            const toolCalls = response.tool_calls;

            if (!toolCalls) {
                myCache.set(chatId, messages);
                // console.log("🤖 ZUPPII:", response);
                console.log("MyCache is: ", JSON.stringify(myCache.data));
                return res.status(200).send({ message: response.content });
            }

            messages.push(response);

            console.log("🔧 Processing Tool Calls...");

            for (const tool of toolCalls) {
                const args = tryParseJSON(tool.function.arguments);
                let result;

                if (tool.function.name === "webSearch") {
                    console.log(`Web Search: ${args.query}`);
                    result = await webSearch(args);
                } else if (tool.function.name === "weatherSearch") {
                    console.log(`Weather Search: ${args.city}`);
                    result = await weatherSearch(args);
                }

                messages.push({
                    role: "tool",
                    tool_call_id: tool.id,
                    content: typeof result === "string" ? result : JSON.stringify(result)
                });
            }

            toolLoops++;
        }

        return res.status(500).send({ message: "Error: Too many internal steps." });

    } catch (error) {
        console.error("Critical Error in Chat:", error);
        return res.status(500).send({ message: "Something went wrong processing your request." });
    }
};