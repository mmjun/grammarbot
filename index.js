const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// ----------------- SHARED BLOCK GENERATOR -----------------
function buildMessageBlocks(corrected) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📝 *Corrected:*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`\n${corrected}\n\`\`\``,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_💡 Tip: Triple-click the box above to copy._",
        },
      ],
    },
  ];
}

// ----------------- SLASH COMMAND: /help -----------------
app.post("/slack/help", async (req, res) => {
  const scenario = req.body.text;

  if (!scenario) {
    return res.status(200).json({
      response_type: "ephemeral",
      text: "❗ Please provide a scenario, e.g. `/help refund after 30 days`",
    });
  }

const prompt = `Write a clear, professional customer service message for this scenario: "${scenario}". Use empathetic, helpful language and vary phrasing slightly between responses to sound more natural. Do not include a greeting or closing. Keep it under 100 words. Return only the message.`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const message = aiRes.data.choices[0].message.content;

    res.status(200).json({
      response_type: "ephemeral", // only visible to the user
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📝 *Suggested Message:*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `\`\`\`\n${message}\n\`\`\``,
          },
        },
      ],
    });
  } catch (error) {
    console.error("❌ Error in /help command:", error.message);
    res.status(200).json({
      response_type: "ephemeral",
      text: "❌ Something went wrong while composing your message.",
    });
  }
});

// ----------------- SLASH COMMAND -----------------
/*
app.post("/slack/grammarbot", async (req, res) => {
  const userText = req.body.text;
  const tone = "professional";
const prompt = `Please revise the following customer service message to improve grammar, spelling, and clarity using a professional tone. You may restructure sentences to improve flow, but do not add or remove content unless necessary for clarity. Do not include greetings, sign-offs, or format it like an email. Return only the revised message:\n\n${userText}`;
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
      blocks: buildMessageBlocks(corrected),
    });
  } catch (error) {
    console.error("❌ Error in slash command:", error.message);
    res.status(200).json({
      response_type: "ephemeral",
      text: "❌ Something went wrong while correcting your text.",
    });
  }
});
*/
// ----------------- EVENTS: DMs + @Mentions -----------------
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === "url_verification") {
    return res.status(200).json({ challenge });
  }

  res.sendStatus(200);

  if (!["message", "app_mention"].includes(event?.type)) return;
  if (event?.bot_id || event?.subtype === "bot_message") return;

  let userText = event.text || "";

  if (userText.includes(`<@${process.env.BOT_USER_ID}>`)) {
    userText = userText.replace(`<@${process.env.BOT_USER_ID}>`, "").trim();
  }

  if (!userText) return;

// Send typing indicator to show the bot is working
await axios.post(
  "https://slack.com/api/chat.typing",
  {
    channel: event.channel,
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
  }
);

try {
  const prompt = `Please improve the following message for customer service use. Correct grammar and spelling, but also rewrite it with a warm, empathetic, and conversational tone. Keep it clear and professional, and restructure for natural flow. Do not include greetings or closings. Return only the improved message:\n\n${userText}`;

  const aiRes = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const corrected = aiRes.data.choices[0].message.content;

  if (!event.channel) return;

  await axios.post(
    "https://slack.com/api/chat.postMessage",
    {
      channel: event.channel,
      text: "📝 Corrected text available",
      blocks: buildMessageBlocks(corrected),
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
} catch (error) {
  console.error("❌ Error in /slack/events:", error.response?.data || error.message);
}
});

// ----------------- PING ENDPOINT -----------------
app.use("/ping", (req, res) => {
  console.log("📶 /ping endpoint was hit");
  res.status(200).send("OK");
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GrammarBot is running on port ${PORT}`);
});
