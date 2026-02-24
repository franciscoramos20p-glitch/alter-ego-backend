import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk'; 
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch'; 
import OpenAI from 'openai';
import fs from 'fs';       // 🔥 NUEVO: Para crear el archivo de audio real
import path from 'path';   // 🔥 NUEVO: Para rutas de archivos

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 CONFIGURACIÓN DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

// 🔥 CLAVE SECRETA ÚNICA PARA EL MODO SIMULADOR 🔥
const SIMULATOR_SECRET_KEY = "ALTER_ROLEPLAY_SECRET_2026";

// 🗣️ VOCES DISPONIBLES DE OPENAI (Para cobrar premium)
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

console.log(`🏆 SERVIDOR V136 (WHISPER TEMP FILE FIX): Puerto: ${PORT}`);

// =================================================================
// 🌍 LISTA MAESTRA DE 100 IDIOMAS
// =================================================================
const LANGUAGES = [
    { code: 'es', name: 'Español', serverName: 'Spanish' },
    { code: 'en', name: 'Inglés', serverName: 'English' },
    { code: 'fr', name: 'Francés', serverName: 'French' },
    { code: 'de', name: 'Alemán', serverName: 'German' },
    { code: 'it', name: 'Italiano', serverName: 'Italian' },
    { code: 'pt-BR', name: 'Portugués (BR)', serverName: 'Portuguese (Brazil)' },
    { code: 'zh-CN', name: 'Chino (Simpl)', serverName: 'Chinese (Simplified)' },
    { code: 'ja', name: 'Japonés', serverName: 'Japanese' },
    { code: 'ko', name: 'Coreano', serverName: 'Korean' },
    { code: 'ru', name: 'Ruso', serverName: 'Russian' },
    { code: 'ar', name: 'Árabe', serverName: 'Arabic' },
    { code: 'hi', name: 'Hindi', serverName: 'Hindi' },
    { code: 'pt-PT', name: 'Portugués (EU)', serverName: 'Portuguese (Portugal)' },
    { code: 'nl', name: 'Holandés', serverName: 'Dutch' },
    { code: 'tr', name: 'Turco', serverName: 'Turkish' },
    { code: 'pl', name: 'Polaco', serverName: 'Polish' },
    { code: 'sv', name: 'Sueco', serverName: 'Swedish' },
    { code: 'uk', name: 'Ucraniano', serverName: 'Ukrainian' },
    { code: 'da', name: 'Danés', serverName: 'Danish' },
    { code: 'no', name: 'Noruego', serverName: 'Norwegian' },
    { code: 'fi', name: 'Finlandés', serverName: 'Finnish' },
    { code: 'el', name: 'Griego', serverName: 'Greek' },
    { code: 'cs', name: 'Checo', serverName: 'Czech' },
    { code: 'hu', name: 'Húngaro', serverName: 'Hungarian' },
    { code: 'ro', name: 'Rumano', serverName: 'Romanian' },
    { code: 'ca', name: 'Catalán', serverName: 'Catalan' },
    { code: 'eu', name: 'Euskera', serverName: 'Basque' },
    { code: 'gl', name: 'Gallego', serverName: 'Galician' },
    { code: 'hr', name: 'Croata', serverName: 'Croatian' },
    { code: 'sr', name: 'Serbio', serverName: 'Serbian' },
    { code: 'sk', name: 'Eslovaco', serverName: 'Slovenian' },
    { code: 'sl', name: 'Esloveno', serverName: 'Slovenian' },
    { code: 'bg', name: 'Búlgaro', serverName: 'Bulgarian' },
    { code: 'et', name: 'Estonio', serverName: 'Estonian' },
    { code: 'lv', name: 'Letón', serverName: 'Latvian' },
    { code: 'lt', name: 'Lituano', serverName: 'Lithuanian' },
    { code: 'is', name: 'Islandés', serverName: 'Icelandic' },
    { code: 'ga', name: 'Irlandés', serverName: 'Irish' },
    { code: 'cy', name: 'Galés', serverName: 'Welsh' },
    { code: 'mt', name: 'Maltés', serverName: 'Maltese' },
    { code: 'sq', name: 'Albanés', serverName: 'Albanian' },
    { code: 'mk', name: 'Macedonio', serverName: 'Macedonian' },
    { code: 'bs', name: 'Bosnio', serverName: 'Bosnian' },
    { code: 'be', name: 'Bielorruso', serverName: 'Belarusian' },
    { code: 'lb', name: 'Luxemburgués', serverName: 'Luxembourgish' },
    { code: 'zh-TW', name: 'Chino (Trad)', serverName: 'Chinese (Traditional)' },
    { code: 'th', name: 'Tailandés', serverName: 'Thai' },
    { code: 'vi', name: 'Vietnamita', serverName: 'Vietnamese' },
    { code: 'id', name: 'Indonesio', serverName: 'Indonesian' },
    { code: 'ms', name: 'Malayo', serverName: 'Malay' },
    { code: 'tl', name: 'Filipino', serverName: 'Tagalog' },
    { code: 'my', name: 'Birmano', serverName: 'Burmese' },
    { code: 'km', name: 'Jemer', serverName: 'Khmer' },
    { code: 'lo', name: 'Laosiano', serverName: 'Lao' },
    { code: 'ne', name: 'Nepalí', serverName: 'Nepali' },
    { code: 'si', name: 'Cingalés', serverName: 'Sinhala' },
    { code: 'mn', name: 'Mongol', serverName: 'Mongolian' },
    { code: 'kk', name: 'Kazajo', serverName: 'Kazakh' },
    { code: 'uz', name: 'Uzbeko', serverName: 'Uzbek' },
    { code: 'ky', name: 'Kirguís', serverName: 'Kyrgyz' },
    { code: 'tg', name: 'Tayiko', serverName: 'Tajik' },
    { code: 'he', name: 'Hebreo', serverName: 'Hebrew' },
    { code: 'fa', name: 'Persa (Farsi)', serverName: 'Persian' },
    { code: 'ps', name: 'Pastún', serverName: 'Pashto' },
    { code: 'ku', name: 'Kurdo', serverName: 'Kurdish' },
    { code: 'hy', name: 'Armenio', serverName: 'Armenian' },
    { code: 'az', name: 'Azerí', serverName: 'Azerbaijani' },
    { code: 'ka', name: 'Georgiano', serverName: 'Georgian' },
    { code: 'bn', name: 'Bengalí', serverName: 'Bengali' },
    { code: 'pa', name: 'Punyabí', serverName: 'Punjabi' },
    { code: 'ta', name: 'Tamil', serverName: 'Tamil' },
    { code: 'te', name: 'Telugu', serverName: 'Telugu' },
    { code: 'mr', name: 'Maratí', serverName: 'Marathi' },
    { code: 'ur', name: 'Urdu', serverName: 'Urdu' },
    { code: 'gu', name: 'Guyaratí', serverName: 'Gujarati' },
    { code: 'kn', name: 'Canarés', serverName: 'Kannada' },
    { code: 'ml', name: 'Malayalam', serverName: 'Malayalam' },
    { code: 'sw', name: 'Suajili', serverName: 'Swahili' },
    { code: 'am', name: 'Amárico', serverName: 'Amharic' },
    { code: 'so', name: 'Somalí', serverName: 'Somali' },
    { code: 'zu', name: 'Zulú', serverName: 'Zulu' },
    { code: 'xh', name: 'Xhosa', serverName: 'Xhosa' },
    { code: 'af', name: 'Afrikáans', serverName: 'Afrikaans' },
    { code: 'yo', name: 'Yoruba', serverName: 'Yoruba' },
    { code: 'ig', name: 'Igbo', serverName: 'Igbo' },
    { code: 'ha', name: 'Hausa', serverName: 'Hausa' },
    { code: 'ht', name: 'Criollo Haitiano', serverName: 'Haitian Creole' },
    { code: 'gn', name: 'Guaraní', serverName: 'Guarani' },
    { code: 'qu', name: 'Quechua', serverName: 'Quechua' },
    { code: 'eo', name: 'Esperanto', serverName: 'Esperanto' },
    { code: 'la', name: 'Latín', serverName: 'Latin' },
    { code: 'mg', name: 'Malgache', serverName: 'Malagasy' },
    { code: 'mi', name: 'Maorí', serverName: 'Maori' },
    { code: 'sm', name: 'Samoano', serverName: 'Samoan' },
    { code: 'haw', name: 'Hawaiano', serverName: 'Hawaiian' },
    { code: 'jw', name: 'Javanés', serverName: 'Javanese' },
    { code: 'su', name: 'Sundanés', serverName: 'Sundanese' },
    { code: 'yi', name: 'Yidis', serverName: 'Yiddish' }
];

// 🔥 LISTA VIP PARA WHISPER (Idiomas que Deepgram no soporta o falla)
const WHISPER_LANGUAGES = [
    'pt-BR', 'zh-CN', 'ar', 'pt-PT', 'eu', 'gl', 'hr', 'sr', 'is', 'ga', 'cy', 'mt', 'sq', 'mk', 'bs', 'be', 'lb', 'zh-TW', 
    'tl', 'my', 'km', 'lo', 'ne', 'si', 'mn', 'kk', 'uz', 'ky', 'tg', 'he', 'fa', 'ps', 'ku', 'hy', 'az', 'ka', 'bn', 'pa', 
    'ta', 'te', 'mr', 'ur', 'gu', 'kn', 'ml', 'sw', 'am', 'so', 'zu', 'xh', 'af', 'yo', 'ig', 'ha', 'ht', 'gn', 'qu', 'eo', 
    'la', 'mg', 'mi', 'sm', 'haw', 'jw', 'su', 'yi'
];

function getLangCode(serverName) {
    if (!serverName) return 'en';
    const found = LANGUAGES.find(l => l.serverName.toLowerCase() === serverName.toLowerCase());
    return found ? found.code : 'en';
}

function sanitizeAiResponse(text) {
    if (!text) return "";
    let clean = text;
    clean = clean.replace(/(\*|\[|\()?(laughs|sighs|chuckles|giggles|smiles|groans|clears throat|pauses)(\*|\]|\))?/gi, "");
    clean = clean.replace(/\*\*/g, "").replace(/\*/g, ""); 
    clean = clean.replace(/Translation:/gi, "").replace(/Translated text:/gi, "");
    clean = clean.replace(/^["']|["']$/g, ""); 
    return clean.trim();
}

// 💓 HEARTBEAT
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// 🔌 CONEXIÓN WEBSOCKET
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 20) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 🔐 AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                let realCredits = 0;
                if (data.user_id) {
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            // 🔥 RUTA PARA COBRAR Y GENERAR EL PRIMER SALUDO CON OPENAI 🔥
            if (data.type === 'tts_request') {
                if (data.simulator_key === SIMULATOR_SECRET_KEY && data.openai_voice) {
                    try {
                        const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                        const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 
                        
                        const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                            body: JSON.stringify({ model: "tts-1", input: data.text, voice: validVoice, speed: voiceSpeed })
                        });
                        
                        if (ttsResponse.ok) {
                            const arrayBuffer = await ttsResponse.arrayBuffer();
                            const base64Audio = Buffer.from(arrayBuffer).toString('base64');
                            ws.send(JSON.stringify({ type: 'full_response', user_text: null, ai_text: data.text, audio: base64Audio }));
                        } else {
                            ws.send(JSON.stringify({ type: 'full_response', user_text: null, ai_text: data.text, audio: null }));
                        }
                    } catch (err) { console.error("Error TTS Request:", err.message); }
                }
                return;
            }

            // 🔥 RUTA DE ANÁLISIS GRAMATICAL 🔥
            if (data.type === 'analyze_grammar') {
                if (data.token !== APP_INTERNAL_KEY) { ws.close(); return; }
                try {
                    const prompt = `Eres un experto profesor de idiomas. Lee la siguiente conversación entre un estudiante (Yo) y un simulador (IA). 
                    Tu trabajo es evaluar ÚNICAMENTE las frases del estudiante ("Yo dije").
                    Detecta errores gramaticales, errores de vocabulario o expresiones poco naturales.
                    Si el estudiante lo hizo bien, felicítalo. Si cometió errores, explícalos de forma amable en español y dale la forma correcta.
                    Sé conciso, claro y directo. Usa viñetas para que sea fácil de leer.
                    
                    Conversación Reciente:
                    ${data.text}`;

                    const completion = await groq.chat.completions.create({
                        messages: [{ role: "user", content: prompt }],
                        model: "llama-3.3-70b-versatile",
                        temperature: 0.5,
                        max_tokens: 500
                    });

                    ws.send(JSON.stringify({ 
                        type: 'grammar_analysis_result', 
                        feedback: completion.choices[0]?.message?.content || "Análisis fallido." 
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'grammar_analysis_error' }));
                }
                return;
            }

            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);

            // =================================================================
            // 🎙️ MODO AUDIO (ENRUTADOR HÍBRIDO: DEEPGRAM / WHISPER)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                let userText = "";
                let detectedCode = codeB; 

                // 🔥 ENRUTADOR INTELIGENTE 🔥
                const useWhisper = WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB);

                try {
                    if (useWhisper) {
                        console.log(`🎧 Usando OPENAI WHISPER para idiomas complejos (${codeA} / ${codeB})`);
                        
                        // 🔥 LA MAGIA: Creamos un archivo real temporal para que Whisper no falle
                        const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.m4a`);
                        fs.writeFileSync(tempFilePath, audioBuffer);

                        const whisperResponse = await openai.audio.transcriptions.create({
                            file: fs.createReadStream(tempFilePath),
                            model: 'whisper-1',
                            prompt: "No alucines. Si hay silencio, no digas 'Subtítulos por', no digas 'Amara.org', no digas 'Gracias por ver', no pongas notas musicales. Escribe solo lo que escuches. Si no escuchas nada, devuelve un texto vacío.",
                            temperature: 0.2 // Baja temperatura para evitar alucinaciones
                        });

                        userText = whisperResponse.text.trim();
                        
                        // 🔥 Borramos el archivo inmediatamente para mantener el servidor limpio
                        fs.unlinkSync(tempFilePath);

                        // Filtro anti-alucinaciones post-Whisper
                        const hallucinations = ["subtítulos por", "amara.org", "gracias por ver", "suscríbete", "♪", "🎵", "thanks for watching", "subtítulos realizados por", "subtítulos:"];
                        const isHallucination = hallucinations.some(h => userText.toLowerCase().includes(h));
                        if (isHallucination) userText = "";

                    } else {
                        console.log(`🎧 Usando DEEPGRAM para idiomas estándar (${codeA} / ${codeB})`);
                        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                            audioBuffer,
                            { 
                                model: "nova-2", 
                                detect_language: [codeA, codeB], 
                                smart_format: true,
                                punctuate: true, 
                                utterances: true,
                                mimetype: 'audio/mp4' 
                            }
                        );

                        if (error) throw new Error("Deepgram Error");
                        userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                        detectedCode = result.results?.channels[0]?.alternatives[0]?.detected_language || codeB; 
                    }

                    if (!userText || userText.length < 1) {
                        console.log("🔇 Silencio detectado o alucinación filtrada. Avisando al frontend.");
                        ws.send(JSON.stringify({ type: 'error_audio_empty' }));
                        return;
                    }
                    
                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    // 🔥 2. CEREBRO INTELIGENTE (GROQ Llama-3) 🔥
                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 500;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        // PROMPT V134: CERO PARÉNTESIS, FLUJO NATURAL
                        const personalityPrompt = data.tone + `
CRITICAL INSTRUCTIONS:
1. Act naturally, keep answers concise (1-3 sentences). No action tags.
2. The user's native language is ${langNameA}. All explanations MUST be in ${langNameA}.
3. When you teach or mention words in ${langNameB}, ALWAYS provide the authentic native script AND its phonetic pronunciation in Latin letters.
4. PROHIBITED: NEVER use parentheses () or brackets []. Integrate the pronunciation naturally into your sentence using commas or phrases like "se pronuncia".
Example: "La palabra hola es こんにちは, que se pronuncia konnichiwa."
5. NEVER leave blank spaces. Always write the full words.`;
                        
                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        // Memoria Limitada a 6 mensajes 
                        if (data.history && Array.isArray(data.history)) {
                            const safeHistory = data.history.slice(-6); 
                            safeHistory.forEach(msg => {
                                if (msg.text && (msg.role === 'user' || msg.role === 'ai')) {
                                    groqMessages.push({
                                        role: msg.role === 'ai' ? 'assistant' : 'user',
                                        content: msg.text
                                    });
                                }
                            });
                        }
                        
                        temp = 0.7; 
                        maxTokens = 200; 
                    } else {
                        // MODO TRADUCTOR CLÁSICO
                        groqMessages.push({ role: "system", content: `You are a STRICT TRANSLATION ENGINE. You are NOT a chatbot. LANGUAGES: Source A: ${langNameA} - Source B: ${langNameB}. CRITICAL RULES: DO NOT answer questions. Output ONLY the raw translated text.` });
                    }

                    groqMessages.push({ role: "user", content: userText });

                    const stream = await groq.chat.completions.create({
                        messages: groqMessages,
                        model: "llama-3.3-70b-versatile",
                        temperature: temp,
                        max_tokens: maxTokens,
                        stream: true
                    });
                    
                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        aiText += content;
                    }

                    aiText = sanitizeAiResponse(aiText);
                    if (!aiText) return;

                    console.log(`🧠 [Respuesta IA]: "${aiText}"`);

                    let base64Audio = null;
                    
                    if (data.simulator_key === SIMULATOR_SECRET_KEY && data.openai_voice) {
                        try {
                            const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                            const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 

                            console.log(`🎙️ Generando Respuesta Premium. Voz: ${validVoice} | Velocidad: ${voiceSpeed}`);

                            // 🔥 ENVIAMOS EL TEXTO EXACTO A OPENAI (SIN ALTERAR) 🔥
                            const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ model: "tts-1", input: aiText, voice: validVoice, speed: voiceSpeed })
                            });
                            
                            if (ttsResponse.ok) {
                                const arrayBuffer = await ttsResponse.arrayBuffer();
                                base64Audio = Buffer.from(arrayBuffer).toString('base64');
                                console.log(`✅ Audio generado y enviado al teléfono.`);
                            } else {
                                console.error("❌ OpenAI TTS Falló. Se enviará sin audio.");
                            }
                        } catch (err) { console.error("Error OpenAI TTS:", err.message); }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', user_text: userText, ai_text: aiText, detected_lang: detectedCode, audio: base64Audio 
                    }));

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO 
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    let groqMessages = [];
                    let temp = 0.0;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        // 🔥 PROMPT V134 TAMBIÉN EN TEXTO 🔥
                        const personalityPrompt = data.tone + `
CRITICAL INSTRUCTIONS:
1. Act naturally, keep answers concise (1-3 sentences). No action tags.
2. The user's native language is ${langNameA}. All explanations MUST be in ${langNameA}.
3. When you teach or mention words in ${langNameB}, ALWAYS provide the authentic native script AND its phonetic pronunciation in Latin letters.
4. PROHIBITED: NEVER use parentheses () or brackets []. Integrate the pronunciation naturally into your sentence using commas or phrases like "se pronuncia".
Example: "La palabra hola es こんにちは, que se pronuncia konnichiwa."
5. NEVER leave blank spaces. Always write the full words.`;
                        
                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        if (data.history && Array.isArray(data.history)) {
                            data.history.slice(-6).forEach(msg => {
                                if (msg.text) groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                            });
                        }
                        temp = 0.7;
                    } else {
                        groqMessages.push({ role: "system", content: `You are a STRICT TRANSLATION ENGINE. Context: Languages are ${langNameA} and ${langNameB}. Task: Translate input to the other language. RULES: DO NOT answer questions. Output ONLY the raw translation.` });
                    }

                    groqMessages.push({ role: "user", content: data.text });

                    const stream = await groq.chat.completions.create({
                        messages: groqMessages,
                        model: "llama-3.3-70b-versatile", 
                        stream: true,
                        temperature: temp
                    });

                    let aiText = "";
                    for await (const chunk of stream) { aiText += chunk.choices[0]?.delta?.content || ""; }
                    aiText = sanitizeAiResponse(aiText);
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio: null }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }
        } catch (e) { console.error("WS Error:", e.message); }
    });
});