import { GoogleGenAI, Type } from "@google/genai";
import { exec, execFile } from "child_process";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-", // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
// const voiceID = "kgG7dCoKCfLehAPWkJOE";
const voiceID = "21m00Tcm4TlvDq8ikWAM"; // Rachel - default female voice

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

// Run an executable directly without a shell. This mirrors running
// `./bin/rhubarb ...` from a terminal but avoids shell differences
// between environments (cmd.exe vs bash). Returns stdout on success.
const execFileCommand = (filePath, args = []) => {
  return new Promise((resolve, reject) => {
    execFile(filePath, args, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(error.message + (stderr ? `\n${stderr}` : ""));
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout || "");
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  // Construct an absolute path to the rhubarb binary so Node executes the
  // same file your terminal runs. Use execFile (no shell) to avoid shell
  // quirks (like './' not working under cmd.exe).
  const binName = process.platform === "win32" ? "rhubarb.exe" : "rhubarb";
  const rhubarbPath = path.resolve(process.cwd(), "bin", binName);

  await execFileCommand(rhubarbPath, [
    "-f",
    "json",
    "-o",
    `audios/message_${message}.json`,
    `audios/message_${message}.wav`,
    "-r",
    "phonetic",
  ]);
  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }
  // if (!elevenLabsApiKey || openai.apiKey === "-") {
  if (!elevenLabsApiKey) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  // Commented out OpenAI code - replaced with Gemini
  // const completion = await openai.chat.completions.create({
  //   model: "gpt-3.5-turbo-1106",
  //   max_tokens: 1000,
  //   temperature: 0.6,
  //   response_format: {
  //     type: "json_object",
  //   },
  //   messages: [
  //     {
  //       role: "system",
  //       content: `
  //       You are a virtual girlfriend.
  //       You will always reply with a JSON array of messages. With a maximum of 3 messages.
  //       Each message has a text, facialExpression, and animation property.
  //       The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
  //       The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.
  //       `,
  //     },
  //     {
  //       role: "user",
  //       content: userMessage || "Hello",
  //     },
  //   ],
  // });
  // let messages = JSON.parse(completion.choices[0].message.content);
  // if (messages.messages) {
  //   messages = messages.messages; // ChatGPT is not 100% reliable, sometimes it directly returns an array and sometimes a JSON object with a messages property
  // }

  // Using Gemini AI
  const ai = new GoogleGenAI({});

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
    You are a virtual girlfriend.
    You will always reply with a JSON array of messages. With a maximum of 3 messages.
    Each message has a text, facialExpression, and animation property.
    The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
    The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.
    
    User message: ${userMessage || "Hello"}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            messages: {
              type: Type.STRING,
            },
            facialExpression: {
              type: Type.STRING,
            },
            animation: {
              type: Type.STRING,
            },
          },
          propertyOrdering: ["messages", "facialExpression", "animation"],
        },
      },
    },
  });

  let messages = JSON.parse(response.text);
  console.debug("Parsed messages:", messages);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    // console.debug(`Processing message ${i}:`, message);
    // generate audio file
    const fileName = `audios/message_${i}.mp3`; // The name of your audio file
    // const textInput = message.text; // The text you wish to convert to speech
    const textInput = message.messages; // The text you wish to convert to speech
    // console.debug(`Text input for audio generation:`, textInput);
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    // generate lipsync
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
