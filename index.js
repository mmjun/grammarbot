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
        text: `📝 *Corrected (${tone}):*`,
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
      type: "actions",
      elements: [
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
  const tone = "professional";

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

  if (!["message", "app_mention"].includes(event?.type)) return;
  if (event?.bot_id || event?.subtype === "bot_message") return;

  let userText = event.text || "";

  if (userText.includes(`<@${process.env.BOT_USER_ID}>`)) {
    userText = userText.replace(`<@${process.env.BOT_USER_ID}>`, "").trim();
  }

  if (!userText) return;

  const tone = "professional";
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

    if (!event.channel) return;

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

  if (action.action_id === "change_tone") {
    const newTone = action.selected_option.value;
    const originalText = payload.message.blocks[0]?.text?.text.replace(/📝 \*Corrected.*:\*\n```|```/g, "").trim();

    const prompt = `Correct the grammar, spelling, and clarity of this text in a ${newTone} tone:\n\n${originalText}`;

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
        "https://slack.com/api/chat.update",
        {
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: "📝 Corrected text updated",
          blocks: buildMessageBlocks(corrected, newTone),
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      return res.sendStatus(200);
    } catch (error) {
      console.error("❌ Error updating tone:", error.response?.data || error.message);
    }
  }

  res.sendStatus(404);
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GrammarBot is running on port ${PORT}`);
});
