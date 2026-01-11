import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR v4.2 (VELOCIDAD + CÁMARA FIX): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🚫 FILTRO DE BASURA
const BLACKLIST = [
    "Amara.org", "Subtitle", "Subtítulos", "MBC", "SBS",
    "Thanks for watching", "Gracias por ver", "suscríbete", "subscribe",
    "copyright", "All rights reserved", "©", "Inglés y Coreano",
    "Spanish, Spanish", "Español, Español", "English, English"
];

// 🗺️ MAPA ISO (Para precisión de Whisper)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar', 'Hindi': 'hi',
    'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl', 'Sueco': 'sv',
    'Griego': 'el', 'Hebreo': 'he', 'Tailandés': 'th', 'Vietnamita': 'vi',
    'Indonesio': 'id', 'Checo': 'cs', 'Danés': 'da', 'Finlandés': 'fi',
    'Húngaro': 'hu', 'Noruego': 'no', 'Rumano': 'ro', 'Ucraniano': 'uk',
    'Tagalo': 'tl', 'Malayo': 'ms', 'Búlgaro': 'bg', 'Croata': 'hr',
    'Eslovaco': 'sk', 'Estonio': 'et', 'Catalán': 'ca', 'Serbio': 'sr',
    'Lituano': 'lt', 'Esloveno': 'sl', 'Letón': 'lv', 'Persa': 'fa',
    'Urdu': 'ur', 'Bengalí': 'bn'
};

wss.on('connection', (ws) => {
    console.log('⚡ Cliente conectado');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            
            // === ⌨️ TEXTO (BARATO: gpt-4o-mini) ===
            if (data.type === 'text_input') {
                console.log(`📝 Texto: "${data.text}"`);
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "interpreter", "gpt-4o-mini");
            }

            // === 🎤 AUDIO (POTENTE: gpt-4o) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                // Detectar idioma exacto para evitar "Dos" -> "God"
                const langName = (data.my_lang || "").split(' ')[0]; 
                const langCode = ISO_LANGS[langName];

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation context: translating between ${data.my_lang} and ${data.language}.`, 
                    temperature: 0, 
                    language: langCode 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); 

                if (!userText || userText.trim().length < 2) return;
                if (BLACKLIST.some(bad => userText.toLowerCase().includes(bad.toLowerCase()))) return;

                console.log(`👂 Audio: "${userText}"`);
                await processGPT(ws, userText, data.my_lang, data.language, tone, data.voice, "interpreter", "gpt-4o");
            }

            // === 👁️ CÁMARA (TRADUCTOR VISUAL) ===
            if (data.type === 'image_input') {
                console.log("📸 Leyendo imagen...");
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `TASK: Extract all text from this image and translate it to ${data.my_lang}. If no text found, describe the scene briefly in ${data.my_lang}. Tone: ${tone}. OUTPUT ONLY THE TRANSLATION.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "high" } }
                        ]}
                    ],
                    max_tokens: 400, 
                });
                
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 Cámara", aiText, tone, data.voice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function processGPT(ws, userText, myLang, targetLang, tone, voice, mode, modelName) {
    try {
        const systemPrompt = `Role: Expert Interpreter.
        Tone: ${tone}.
        RULES:
        1. Translate accurately.
        2. ${myLang} -> ${targetLang}.
        3. ${targetLang} -> ${myLang}.
        4. DO NOT CHAT. DO NOT EXPLAIN.
        5. DO NOT REPEAT LANGUAGE NAMES (e.g. "Spanish:").
        6. OUTPUT ONLY THE TRANSLATED TEXT.`;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            model: modelName, 
            temperature: 0.3,
            max_tokens: 300, 
        });

        let aiText = completion.choices[0].message.content;
        if (aiText.includes(myLang) && aiText.length < 15) return; 
        
        sendResponse(ws, userText, aiText, tone, voice);

    } catch (e) { console.error("Error GPT:", e.message); }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) { console.error("Error TTS:", e.message); }
}