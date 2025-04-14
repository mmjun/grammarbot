const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

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

    res.status(200).json({
      response_type: "in_channel",
      text: `📝 *Corrected:* \n${corrected}`,
    });
  } catch (error) {
    console.error("❌ Error in slash command:", error.message);
    res.status(200).json({
      response_type: "ephemeral",
      text: "❌ Something went wrong while correcting your text.",
    });
  }
});

// ----------------- EVENTS: DMs + @Mentions -----------------
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  // ✅ Slack URL verification
  if (type === "url_verification") {
    return res.status(200).json({ challenge });
  }

  // ✅ Acknowledge event quickly
  res.sendStatus(200);

  // ✅ Only handle messages or app_mention events
  if (!["message", "app_mention"].includes(event?.type)) return;

  // ✅ Ignore bot messages
  if (event?.bot_id || event?.subtype === "bot_message") return;

  let userText = event.text || "";

  // ✅ Clean up @mentions
  if (userText.includes(`<@${process.env.BOT_USER_ID}>`)) {
    userText = userText.replace(`<@${process.env.BOT_USER_ID}>`, "").trim();
  }

  if (!userText) return;

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

    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: event.channel,
        text: `📝 *Corrected:* \n${corrected}`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Error in /slack/events:", error.message);
  }
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GrammarBot is running on port ${PORT}`);
});
