import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR PRO v8.0 (APK READY): Listo en puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Diccionario de códigos de idioma para Whisper (Mejora la precisión)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar', 'Hindi': 'hi',
    'Turco': 'tr', 'Polaco': 'pl', 'Ucraniano': 'uk', 'Tailandés': 'th'
    // Whisper autodetecta bien el resto, esto ayuda a los principales
};

wss.on('connection', (ws, req) => {
    const url = req.url || "/";
    console.log(`⚡ Conexión: ${url}`);

    if (url.includes('/live')) {
        handleLiveSession(ws);
    } else {
        handleClassicSession(ws);
    }
});

// -------------------------------------------------
// MODO LIVE (Optimizado para velocidad en APK)
// -------------------------------------------------
function handleLiveSession(ws) {
    let config = { my_lang: 'Español', target_lang: 'Inglés' };

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'config') {
                config = data;
                console.log(`🎙️ Live Configurado: ${config.my_lang} <-> ${config.target_lang}`);
            } 
            else if (data.type === 'audio_append') {
                // 1. Guardar Audio
                const inputPath = path.join(tempDir, `live_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.audio, 'base64'));

                // 2. Transcribir (Whisper)
                // Usamos el idioma origen para acelerar la detección
                const langCode = ISO_LANGS[config.my_lang.split(' ')[0]] || undefined;
                
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: langCode, 
                    prompt: "Conversation." // Prompt corto ayuda a la velocidad
                });
                
                fs.unlinkSync(inputPath); // Limpieza inmediata

                const text = transcription.text;
                if (!text || text.trim().length < 2) return; // Ignorar silencios/ruidos

                console.log(`🗣️ Usuario: ${text}`);

                // 3. Traducir (GPT-4o Turbo)
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: `Actúa como un intérprete experto. Traduce el siguiente texto del ${config.my_lang} al ${config.target_lang}. SOLO devuelve la traducción, sin explicaciones.` },
                        { role: "user", content: text }
                    ],
                    max_tokens: 100, // Respuesta corta para velocidad máxima
                });
                
                const translatedText = completion.choices[0].message.content;
                console.log(`🤖 Traducción: ${translatedText}`);

                // 4. Voz (TTS)
                const mp3 = await openai.audio.speech.create({ 
                    model: "tts-1", voice: "alloy", input: translatedText, speed: 1.15 
                });
                const audioBuffer = Buffer.from(await mp3.arrayBuffer());

                // 5. Responder
                ws.send(JSON.stringify({
                    type: 'audio_delta',
                    payload: audioBuffer.toString('base64')
                }));
            }
        } catch (e) {
            console.error("Error Live:", e.message);
        }
    });
}

// -------------------------------------------------
// MODO CLÁSICO (Chat y Fotos)
// -------------------------------------------------
function handleClassicSession(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral";

            if (data.type === 'text_input') {
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "gpt-4o-mini");
            }
            else if (data.type === 'image_input') {
                 const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Si no hay texto, describe. Tono: ${tone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice);
            }
            else if (data.type === 'audio_input') {
                // Lógica clásica de audio (backup)
                const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
                const trans = await openai.audio.transcriptions.create({ file: fs.createReadStream(inputPath), model: "whisper-1" });
                fs.unlinkSync(inputPath);
                if(trans.text) await processGPT(ws, trans.text, data.my_lang, data.language, tone, data.voice, "gpt-4o");
            }

        } catch (e) { console.error("Error Clásico:", e.message); }
    });
}

async function processGPT(ws, text, src, tgt, tone, voice, model) {
    const gpt = await openai.chat.completions.create({
        messages: [{ role: "system", content: `Traduce del ${src} al ${tgt}. Tono: ${tone}.` }, { role: "user", content: text }],
        model: model
    });
    sendResponse(ws, text, gpt.choices[0].message.content, tone, voice);
}

async function sendResponse(ws, userText, aiText, tone, voice) {
    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: voice, input: aiText, speed: 1.1 });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: buffer.toString('base64') }));
}