const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // Required for parsing Slack's JSON requests

app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  // ✅ 1. Handle Slack's URL verification
  if (type === "url_verification") {
    return res.status(200).json({ challenge });
  }

  // ✅ 2. Always respond quickly to Slack events
  res.sendStatus(200);

  // ✅ 3. Skip if this is the bot's own message
  if (event?.bot_id || event?.subtype === "bot_message") return;

  // ✅ 4. Remove @bot mention if present
  let userText = event.text || "";
  const botUserId = process.env.BOT_USER_ID;

  if (userText.includes(`<@${botUserId}>`)) {
    userText = userText.replace(`<@${botUserId}>`, "").trim();
  }

  // ✅ 5. Send text to OpenAI for correction
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

    // ✅ 6. Send the response back to the channel/user
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
  } catch (err) {
    console.error("❌ OpenAI or Slack error:", err.message);
  }
});

app.post("/slack/grammarbot", async (req, res) => {
  const userText = req.body.text;

  const prompt = `Correct the grammar, spelling, and clarity of this text:\n\n${userText}`;

  const response = await axios.post(
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

  const corrected = response.data.choices[0].message.content;

  res.json({
    response_type: "in_channel",
    text: `📝 *Corrected:* \n${corrected}`,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
