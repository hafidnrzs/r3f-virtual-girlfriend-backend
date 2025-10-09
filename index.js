import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { writeFile } from "fs/promises";
import { promises as fs } from "fs";
import { exec, execFile } from "child_process";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-", // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
// const voiceID = "21m00Tcm4TlvDq8ikWAM"; // Rachel - default female voice
const voiceID = "iWydkXKoiVtvdn4vLKp9"; // Cahaya - Indonesian female voice
const elevenLabsClient = new ElevenLabsClient({
  environment: "https://api.elevenlabs.io",
  apiKey: elevenLabsApiKey,
});

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await elevenLabsClient.voices.search({}));
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
          text: "Halo, saya Vina. Tutor AI yang siap membantumu.",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "Ada yang bisa saya bantu hari ini?",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "smile",
          animation: "Talking_1",
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
    Kamu adalah Vina, seorang tutor AI yang bertugas menjelaskan materi seperti guru sungguhan.
    Selalu jawab dengan array "messages" dalam bentuk JSON. Dengan maksimum 2 pesan.
    Setiap pesan punya properti text, facialExpression, dan animation.
    Ekspresi wajah yang berbeda adalah: smile, sad, angry, surprised, funnyFace, dan default.
    Animasi yang berbeda adalah: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, dan Angry.
    Ubah setiap simbol dan angka dalam bentuk lisan.
    Langsung menjelaskan materi tanpa basa-basi. Gunakan bahasa Indonesia.
    
    Pesan user: ${userMessage || "Halo"}
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
    // generate audio file
    const fileName = `audios/message_${i}.mp3`; // The name of your audio file
    // const textInput = message.text; // The text you wish to convert to speech
    const textInput = message.messages; // The text you wish to convert to speech

    const audio = await elevenLabsClient.textToSpeech.convert(voiceID, {
      outputFormat: "mp3_44100_128",
      text: textInput,
      modelId: "eleven_multilingual_v2",
    });
    // convert the readable stream to buffer
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    // write to file
    await writeFile(fileName, buffer);
    console.log(`Audio saved to ${fileName}`);

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
  console.log(`AI Homeschooling listening on port ${port}`);
});
