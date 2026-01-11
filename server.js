import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR v4.0 (HÍBRIDO 4o/MINI): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🚫 LISTA NEGRA (Anti-Fantasmas)
const BLACKLIST = [
    "Amara.org", "Subtitle", "Subtítulos", "albertoplasencia", "MBC", "SBS",
    "Thanks for watching", "Gracias por ver", "suscríbete", "subscribe",
    "copyright", "All rights reserved", "©", "Inglés y Coreano",
    "Spanish, Spanish", "Español, Español", "English, English",
    "Silence", "..."
];

// 🗺️ MAPA DE 50 IDIOMAS (Vital para precisión de Whisper)
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
            
            // === ⌨️ MODO TEXTO (ECONÓMICO: GPT-4o-mini) ===
            if (data.type === 'text_input') {
                console.log(`📝 Texto (Mini): "${data.text}"`);
                // Usamos "gpt-4o-mini" para ahorrar costos en texto
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "interpreter", "gpt-4o-mini");
            }

            // === 🎤 MODO AUDIO (POTENTE: GPT-4o) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                // Detectamos el código de idioma para ayudar a Whisper
                // Esto arregla el error de "Dos" -> "God"
                const langName = (data.my_lang || "").split(' ')[0]; // Toma "Español" de "Español 🇪🇸"
                const langCode = ISO_LANGS[langName];

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation context: translating between ${data.my_lang} and ${data.language}.`, 
                    temperature: 0, 
                    language: langCode // 👈 ESTA LÍNEA ES LA CLAVE DE LA PRECISIÓN
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); 

                // Filtros de Seguridad
                if (!userText || userText.trim().length < 2) return;
                if (BLACKLIST.some(bad => userText.toLowerCase().includes(bad.toLowerCase()))) return;

                console.log(`👂 Audio (GPT-4o): "${userText}"`);
                // Usamos "gpt-4o" para máxima inteligencia en voz
                await processGPT(ws, userText, data.my_lang, data.language, tone, data.voice, "interpreter", "gpt-4o");
            }

            // === 👁️ CÁMARA (POTENTE) ===
            if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Tono: ${tone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function processGPT(ws, userText, myLang, targetLang, tone, voice, mode, modelName) {
    try {
        const systemPrompt = `Role: Expert Interpreter.
        Tone: ${tone}.
        
        STRICT RULES:
        1. Translate the user input accurately.
        2. If input is ${myLang} -> Output ${targetLang}.
        3. If input is ${targetLang} -> Output ${myLang}.
        4. DO NOT CHAT. DO NOT EXPLAIN. DO NOT SAY "Here is the translation".
        5. DO NOT REPEAT THE LANGUAGE NAME (e.g. "Spanish: ...").
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

        // Filtro final anti-repetición
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