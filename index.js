const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const BOT_USER_ID = process.env.BOT_USER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// ----------------- SLASH COMMAND -----------------
app.post("/slack/grammarbot", async (req, res) => {
  const userText = req.body.text;

  const prompt = `Correct the grammar, spelling, and clarity of this text:\n\n${userText}`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const corrected = aiRes.data.choices[0].message.content;

    // ✅ Return corrected version directly to Slack
    res.status(200).json({
      response_type: "in_channel",
      text: `📝 *Corrected:* \n${corrected}`,
    });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.status(200).json({
      response_type: "ephemeral",
      text: "❌ Something went wrong trying to fix your grammar.",
    });
  }
});

// ----------------- EVENT SUBSCRIPTIONS -----------------
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  // ✅ Slack URL verification
  if (type === "url_verification") {
    return res.status(200).json({ challenge });
  }

  // ✅ Respond immediately so Slack doesn’t timeout
  res.sendStatus(200);

  // Skip bot's own messages
  if (event?.bot_id || event?.subtype === "bot_message") return;

  // Get and clean message text
  let userText = event.text || "";
  if (userText.includes(`<@${BOT_USER_ID}>`)) {
    userText = userText.replace(`<@${BOT_USER_ID}>`, "").trim();
  }

  if (!userText) return;

  const prompt = `Correct the grammar, spelling, and clarity of this text:\n\n${userText}`;

  try {
    // 🧠 Call OpenAI
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const corrected = aiRes.data.choices[0].message.content;

    // ✅ Send reply back to user
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: event.channel,
        text: `📝 *Corrected:* \n${corrected}`,
      },
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Error handling event:", error.message);
  }
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GrammarBot is running on port ${PORT}`);
});
