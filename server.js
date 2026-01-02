import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 CEREBRO VELOZ (v3.4 - FLASH MODE): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🚫 LISTA NEGRA DE ALUCINACIONES (Anti-Fantasmas)
const HALLUCINATION_BLACKLIST = [
    "Amara.org", "Subtitle", "Subtítulos", "albertoplasencia", 
    "Thanks for watching", "Gracias por ver", "suscríbete", "subscribe",
    "like and subscribe", "dale like", "comment below", "moo", 
    "MBC", "SBS", "copyright", "All rights reserved", "©"
];

// 🗺️ MAPA DE IDIOMAS
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh', 'Coreano': 'ko' 
};

wss.on('connection', (ws) => {
    console.log('⚡ Cliente Flash conectado');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral";
            const chosenVoice = data.voice || "alloy";
            const mode = data.mode || "interpreter"; 

            // === 🎤 AUDIO INPUT (SÚPER RÁPIDO) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                // 1. TRANSCRIPCIÓN (WHISPER)
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation in ${myLang}, ${targetLang} and Korean.`, 
                    temperature: 0, 
                    language: ISO_LANGS[myLang.split(' ')[0]] 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); // Borrar archivo rápido

                // 🛡️ FILTRO RÁPIDO ANTI-BASURA
                if (!userText || userText.trim().length < 2) return;
                const isGhost = HALLUCINATION_BLACKLIST.some(phrase => userText.toLowerCase().includes(phrase.toLowerCase()));
                if (isGhost) {
                    console.log(`👻 Ignorando: "${userText}"`);
                    return; 
                }

                console.log(`👂 Oído: "${userText}"`);

                // 2. EL CEREBRO (GPT-4o)
                let systemPrompt = "";
                if (mode === 'interpreter') {
                    systemPrompt = `Eres un intérprete experto.
                    Usuario: ${myLang}. Interlocutor: ${targetLang}.
                    
                    REGLAS:
                    1. Si escuchas ${myLang} -> Traduce al ${targetLang}.
                    2. Si escuchas ${targetLang} -> Traduce al ${myLang}.
                    3. Mantén el tono: ${chosenTone}.
                    4. Para Coreano 🇰🇷: Usa honoríficos si es Formal, Banmal si es Barrio.
                    5. Sé directo y natural.`;
                } else {
                    systemPrompt = `Eres un traductor personal. Tu dueño habla ${myLang}.
                    Traduce todo lo que escuches al ${myLang} con tono ${chosenTone}.`;
                }

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o", // 🧠 Mantenemos el cerebro inteligente
                    temperature: 0.3,
                    max_tokens: 200, // Limitamos longitud para respuesta más rápida
                });

                const aiText = completion.choices[0].message.content;
                if (aiText.includes("BLOCK") || !aiText) return;

                // 3. VOZ ULTRARRÁPIDA
                sendResponse(ws, userText, aiText, chosenTone, chosenVoice);
            }

            // === 👁️ VISIÓN (CÁMARA FLASH) ===
            if (data.type === 'image_input') {
                console.log("📸 Procesando imagen...");
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${myLang}. Si no hay texto, describe brevemente qué ves. Tono: ${chosenTone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } } // "auto" es más rápido que "high"
                        ]}
                    ],
                    max_tokens: 300, 
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 Imagen analizada", aiText, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        // ⚡ CAMBIO CLAVE: Usamos 'tts-1' (Standard) en lugar de 'hd'.
        // Es MUCHO más rápido y la diferencia de calidad en móvil es mínima.
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", 
            voice: voice, 
            input: aiText, 
            speed: 1.1 // Un 10% más rápido para agilizar la conversación
        });
        
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) {
        console.error("Error audio:", e);
    }
}