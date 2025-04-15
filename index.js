const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// ----------------- SHARED BLOCK GENERATOR -----------------
function buildMessageBlocks(corrected, tone) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📝 *Corrected (${tone}):*\n${corrected}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📋 Copy This",
          },
          action_id: "open_copy_modal",
          value: corrected,
        },
        {
          type: "static_select",
          action_id: "change_tone",
          placeholder: {
            type: "plain_text",
            text: `Tone: ${tone.charAt(0).toUpperCase() + tone.slice(1)}`,
          },
          options: [
            {
              text: {
                type: "plain_text",
                text: "Casual",
              },
              value: "casual",
            },
            {
              text: {
                type: "plain_text",
                text: "Professional",
              },
              value: "professional",
            },
          ],
        },
      ],
    },
  ];
}

// ----------------- SLASH COMMAND -----------------
app.post("/slack/grammarbot", async (req, res) => {
  const userText = req.body.text;
  const tone = "professional"; // default tone

  const prompt = `Correct the grammar, spelling, and clarity of this text in a ${tone} tone:\n\n${userText}`;

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
      blocks: buildMessageBlocks(corrected, tone),
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

  if (type === "url_verification") {
    return res.status(200).json({ challenge });
  }

  res.sendStatus(200);

  console.log("📥 Event received:", JSON.stringify(event, null, 2));

  if (!["message", "app_mention"].includes(event?.type)) return;
  if (event?.bot_id || event?.subtype === "bot_message") return;

  let userText = event.text || "";

  if (userText.includes(`<@${process.env.BOT_USER_ID}>`)) {
    userText = userText.replace(`<@${process.env.BOT_USER_ID}>`, "").trim();
  }

  if (!userText) return;
  const tone = "professional"; // default tone
  const prompt = `Correct the grammar, spelling, and clarity of this text in a ${tone} tone:\n\n${userText}`;

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

    if (!event.channel) {
      console.error("❌ No event.channel provided. Cannot reply.");
      return;
    }

    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: event.channel,
        text: "📝 Corrected text available",
        blocks: buildMessageBlocks(corrected, tone),
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

// ----------------- INTERACTIONS -----------------
app.post("/slack/interactions", express.urlencoded({ extended: true }), async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const action = payload.actions?.[0];

  if (!action) return res.sendStatus(400);

  if (action.action_id === "open_copy_modal") {
    const corrected = action.value;

    await axios.post(
      "https://slack.com/api/views.open",
      {
        trigger_id: payload.trigger_id,
        view: {
          type: "modal",
          title: {
            type: "plain_text",
            text: "📋 Copy Text",
          },
          close: {
            type: "plain_text",
            text: "Close",
          },
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Corrected Text:*\n\`\`\`${corrected}\`\`\``,
              },
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GrammarBot is running on port ${PORT}`);
});
