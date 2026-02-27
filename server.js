import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk'; 
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch'; 
import OpenAI from 'openai';
import fs from 'fs';       
import path from 'path';   

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

// 🗣️ VOCES DISPONIBLES DE OPENAI
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

console.log(`🏆 SERVIDOR V154 (MODO FREEMIUM REPARADO): Puerto: ${PORT}`);

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

// 🔥 LISTA VIP PARA WHISPER 
const WHISPER_LANGUAGES = [
    'pt-BR', 'zh-CN', 'ar', 'pt-PT', 'eu', 'gl', 'hr', 'sr', 'is', 'ga', 'cy', 'mt', 'sq', 'mk', 'bs', 'be', 'lb', 'zh-TW', 
    'tl', 'my', 'km', 'lo', 'ne', 'si', 'mn', 'kk', 'uz', 'ky', 'tg', 'he', 'fa', 'ps', 'ku', 'hy', 'az', 'ka', 'bn', 'pa', 
    'ta', 'te', 'mr', 'ur', 'gu', 'kn', 'ml', 'sw', 'am', 'so', 'zu', 'xh', 'af', 'yo', 'ig', 'ha', 'ht', 'gn', 'qu', 'eo', 
    'la', 'mg', 'mi', 'sm', 'haw', 'jw', 'su', 'yi'
];

// 🔥 LISTA DESTRUCTORA DE ALUCINACIONES 🔥
const WHISPER_HALLUCINATIONS = [
    "subtítulos", "subtitulos", "amara.org", "gracias por ver", "thanks for watching", 
    "suscríbete", "subscribe", "♪", "🎵", "🎶", "[música]", "(música)", "[music]", "(music)",
    "[silencio]", "(silencio)", "traducido por", "translated by", "youtu.be", ".com", 
    "www.", "televisión española", "derechos de autor", "copyright", "subtítulos realizados",
    "subs by", "amara", "subs:", "subtítulos:", "si hay silencio", "devuelve un texto", "vacío",
    "如果没有声音", "如果没有声音", "返回空文本", "if there is no clear human speech", "empty string",
    "el asiento ahora es impecable", "cámara de diputados", "república de chile", "de cierta manera"
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
    clean = clean.replace(/<([^>]+)>/g, "$1");
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
                        
                        // ==============================================================================
                        // 🔥 1. INICIO DE SOLUCIÓN: EVITAR QUE LA VOZ SE TRABE (EN EL SALUDO) 🔥
                        // PROBLEMA: Si el texto tiene "(안녕하세요)", el motor de voz OpenAI se confunde y no lee.
                        // SOLUCIÓN: Creamos la variable "textForAudioGreeting". Usamos una fórmula (Regex) 
                        // -> /\s*\([^)]*\)/g <- que significa: "Busca un espacio, abre paréntesis, agarra todo 
                        // lo de adentro, cierra paréntesis... ¡Y BORRALO!".
                        // RESULTADO: OpenAI solo recibe 'jo-heun-a-chim' y lo lee perfecto.
                        // ==============================================================================
                        let textForAudioGreeting = data.text.replace(/\s*\([^)]*\)/g, '');
                        // ================== FIN DE EXPLICACIÓN ========================================

                        const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                            // Nota: Aquí se manda 'textForAudioGreeting' al motor, pero a tu App se manda 'data.text' completo.
                            body: JSON.stringify({ model: "tts-1", input: textForAudioGreeting, voice: validVoice, speed: voiceSpeed })
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
            // 🎙️ MODO AUDIO (RUTAS: audio_input y free_audio_input)
            // =================================================================
            if (data.type === 'audio_input' || data.type === 'free_audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                const isFreeMode = data.type === 'free_audio_input';
                let userText = "";
                let detectedCode = codeB; 

                const useWhisper = WHISPER_LANGUAGES.includes(codeA) || WHISPER_LANGUAGES.includes(codeB);

                try {
                    const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.m4a`);
                    fs.writeFileSync(tempFilePath, audioBuffer);

                    if (isFreeMode) {
                        console.log(`🎧 [MODO GRATIS] Usando GROQ Whisper`);
                        const whisperResponse = await groq.audio.transcriptions.create({
                            file: fs.createReadStream(tempFilePath),
                            model: 'whisper-large-v3-turbo',
                            prompt: "Clean transcription. No hallucinations. Do not write anything if it is just silence.",
                            temperature: 0.0
                        });
                        userText = whisperResponse.text.trim();
                    } else {
                        if (useWhisper) {
                            console.log(`🎧 [MODO PRO] Usando OPENAI WHISPER (${codeA} / ${codeB})`);
                            const whisperResponse = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(tempFilePath),
                                model: 'whisper-1',
                                temperature: 0.0, 
                                condition_on_previous_text: false 
                            });
                            userText = whisperResponse.text.trim();
                        } else {
                            console.log(`🎧 [MODO PRO] Usando DEEPGRAM (${codeA} / ${codeB})`);
                            const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                                audioBuffer, { model: "nova-2", detect_language: [codeA, codeB], smart_format: true, punctuate: true, utterances: true, mimetype: 'audio/mp4' }
                            );
                            if (error) throw new Error("Deepgram Error");
                            userText = result.results?.channels[0]?.alternatives[0]?.transcript.trim();
                            detectedCode = result.results?.channels[0]?.alternatives[0]?.detected_language || codeB; 
                        }
                    }

                    fs.unlinkSync(tempFilePath); 

                    // Filtro Anti-Alucinaciones
                    const textLower = userText.toLowerCase();
                    const isHallucination = WHISPER_HALLUCINATIONS.some(h => textLower.includes(h));
                    if (isHallucination) userText = ""; 

                    if (userText && userText.length <= 2 && !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(userText)) {
                        userText = "";
                    }

                    if (!userText || userText.length < 1) {
                        ws.send(JSON.stringify({ type: 'error_audio_empty' }));
                        return;
                    }
                    
                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    // 🔥 CEREBRO INTELIGENTE (GROQ Llama-3)
                    let groqMessages = [];
                    let temp = 0.0;
                    let maxTokens = 500;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        const personalityPrompt = data.tone + `
CRITICAL INSTRUCTION: You are a helpful language tutor. Your student's native language is ${langNameA}. You are teaching them ${langNameB}.

MANDATORY RULES:
1. Explain concepts, meanings, and rules clearly in ${langNameA}.
2. When introducing a phrase or word in ${langNameB}, ALWAYS explain how it is pronounced using simple phonetic spelling (romanization) so the student can read it.
3. ALWAYS include the true native script of ${langNameB} in parentheses immediately after the phonetic spelling. This allows the Text-to-Speech (TTS) engine to read it with a perfect accent.
4. DO NOT use HTML/XML tags, brackets, or asterisks.

EXAMPLE FORMAT:
"Para decir hola en coreano, debes decir 'annyeonghaseyo' (안녕하세요)."
"Para decir gracias en japonés, puedes decir 'arigato' (ありがとう)."

Keep your responses natural, friendly, and short (1 or 2 sentences maximum).`;
                        
                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        if (data.history && Array.isArray(data.history)) {
                            const safeHistory = data.history.slice(-6); 
                            safeHistory.forEach(msg => {
                                if (msg.text && (msg.role === 'user' || msg.role === 'ai')) {
                                    groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                                }
                            });
                        }
                        temp = 0.7; 
                        maxTokens = 200; 
                    } else {
                        groqMessages.push({ 
                            role: "system", 
                            content: `You are a pure, machine-like translation API translating between ${langNameA} and ${langNameB}.
CRITICAL RULES:
1. Detect the input language and translate it directly into the OTHER language.
2. OUTPUT ONLY THE TRANSLATED TEXT. NO CONVERSATION.
3. ABSOLUTELY NO explanations, NO notes, NO apologies.
4. If the input is gibberish, random letters, or typos (e.g. 'Bjaj', 'Hhakk', 'Uahq'), JUST RETURN THE EXACT SAME GIBBERISH. DO NOT say 'No translation available' or explain that it is invalid. NEVER refuse to translate.
5. If the input is mixed languages (Spanglish) or bad grammar, translate it directly without correcting the user or adding notes.
6. Your entire response must be just the final translation.` 
                        });
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
                    
                    if (!isFreeMode && data.simulator_key === SIMULATOR_SECRET_KEY && data.openai_voice) {
                        try {
                            const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                            const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 

                            // ==============================================================================
                            // 🔥 2. INICIO DE SOLUCIÓN: EVITAR QUE LA VOZ SE TRABE (RESPUESTA DE AUDIO) 🔥
                            // Si el usuario habló por el micrófono, la IA responde aquí.
                            // Separamos el texto que se le manda a OpenAI del texto que va a la pantalla.
                            // La app recibe "aiText" intacto (para que se vean los símbolos originales).
                            // OpenAI recibe "textForAudio" sin los paréntesis para que no se atragante y hable fluido.
                            // ==============================================================================
                            let textForAudio = aiText.replace(/\s*\([^)]*\)/g, '');
                            // ================== FIN DE EXPLICACIÓN ========================================

                            const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                // Nota: Enviamos 'textForAudio' en lugar de 'aiText'
                                body: JSON.stringify({ model: "tts-1", input: textForAudio, voice: validVoice, speed: voiceSpeed })
                            });
                            
                            if (ttsResponse.ok) {
                                const arrayBuffer = await ttsResponse.arrayBuffer();
                                base64Audio = Buffer.from(arrayBuffer).toString('base64');
                            } 
                        } catch (err) { console.error("Error OpenAI TTS:", err.message); }
                    }

                    // Fíjate que aquí enviamos "ai_text: aiText" para que tu pantalla siga mostrando todo completo.
                    ws.send(JSON.stringify({ 
                        type: 'full_response', user_text: userText, ai_text: aiText, detected_lang: detectedCode, audio: base64Audio 
                    }));

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (RUTAS: text_input y free_text_input)
            // =================================================================
            else if (data.type === 'text_input' || data.type === 'free_text_input') {
                try {
                    let groqMessages = [];
                    let temp = 0.0;

                    if (data.simulator_key === SIMULATOR_SECRET_KEY) {
                        const personalityPrompt = data.tone + `
CRITICAL INSTRUCTION: You are a helpful language tutor. Your student's native language is ${langNameA}. You are teaching them ${langNameB}.

MANDATORY RULES:
1. Explain concepts, meanings, and rules clearly in ${langNameA}.
2. When introducing a phrase or word in ${langNameB}, ALWAYS explain how it is pronounced using simple phonetic spelling (romanization) so the student can read it.
3. ALWAYS include the true native script of ${langNameB} in parentheses immediately after the phonetic spelling. This allows the Text-to-Speech (TTS) engine to read it with a perfect accent.
4. DO NOT use HTML/XML tags, brackets, or asterisks.

EXAMPLE FORMAT:
"Para decir hola en coreano, debes decir 'annyeonghaseyo' (안녕하세요)."
"Para decir gracias en japonés, puedes decir 'arigato' (ありがとう)."

Keep your responses natural, friendly, and short (1 or 2 sentences maximum).`;
                        
                        groqMessages.push({ role: "system", content: personalityPrompt });
                        
                        if (data.history && Array.isArray(data.history)) {
                            data.history.slice(-6).forEach(msg => {
                                if (msg.text) groqMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text });
                            });
                        }
                        temp = 0.7;
                    } else {
                        groqMessages.push({ 
                            role: "system", 
                            content: `You are a pure, machine-like translation API translating between ${langNameA} and ${langNameB}.
CRITICAL RULES:
1. Detect the input language and translate it directly into the OTHER language.
2. OUTPUT ONLY THE TRANSLATED TEXT. NO CONVERSATION.
3. ABSOLUTELY NO explanations, NO notes, NO apologies.
4. If the input is gibberish, random letters, or typos (e.g. 'Bjaj', 'Hhakk', 'Uahq'), JUST RETURN THE EXACT SAME GIBBERISH. DO NOT say 'No translation available' or explain that it is invalid. NEVER refuse to translate.
5. If the input is mixed languages (Spanglish) or bad grammar, translate it directly without correcting the user or adding notes.
6. Your entire response must be just the final translation.` 
                        });
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
                    
                    let base64Audio = null;
                    if (!isFreeMode && data.simulator_key === SIMULATOR_SECRET_KEY && data.openai_voice) {
                        try {
                            const validVoice = OPENAI_VOICES.includes(data.openai_voice) ? data.openai_voice : 'nova';
                            const voiceSpeed = data.speed ? parseFloat(data.speed) : 1.0; 

                            // ==============================================================================
                            // 🔥 3. INICIO DE SOLUCIÓN: EVITAR QUE LA VOZ SE TRABE (RESPUESTA DE TEXTO) 🔥
                            // Si el usuario usó el teclado para escribir, la app pasa por aquí.
                            // Hacemos exactamente el mismo borrado de los paréntesis para el motor de voz OpenAI.
                            // ==============================================================================
                            let textForAudio = aiText.replace(/\s*\([^)]*\)/g, '');
                            // ================== FIN DE EXPLICACIÓN ========================================

                            const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
                                // Nota: Enviamos 'textForAudio' a la IA de voz.
                                body: JSON.stringify({ model: "tts-1", input: textForAudio, voice: validVoice, speed: voiceSpeed })
                            });
                            
                            if (ttsResponse.ok) {
                                const arrayBuffer = await ttsResponse.arrayBuffer();
                                base64Audio = Buffer.from(arrayBuffer).toString('base64');
                            } 
                        } catch (err) { console.error("Error OpenAI TTS:", err.message); }
                    }

                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio: base64Audio }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }
        } catch (e) { console.error("WS Error:", e.message); }
    });
});