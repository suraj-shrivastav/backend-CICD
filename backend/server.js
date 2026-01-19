import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { chat } from "./src/controllers/chat.controller.js";

dotenv.config();
const app = express();

app.use(express.json());

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));

app.post("/chat", chat);

app.get("/health", (req, res) => {
    res.send("Working... Healthy");
})
const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

