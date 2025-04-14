const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/slack/grammarbot", async (req, res) => {
  const userText = req.body.text;

  const prompt = `Correct the grammar, spelling, and clarity of this text:\n\n${userText}`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
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
