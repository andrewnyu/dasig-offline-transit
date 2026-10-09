package app.dasig.transit

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

class OfflineVoiceModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var textToSpeech: TextToSpeech? = null

  override fun getName(): String = "OfflineVoice"

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun isAvailable(promise: Promise) {
    val available = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    promise.resolve(available)
  }

  @ReactMethod
  fun start(localeTag: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
      promise.reject("VOICE_UNAVAILABLE", "This device has no installed on-device speech recognizer.")
      return
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
      promise.reject("MICROPHONE_DENIED", "Microphone permission is required.")
      return
    }
    mainHandler.post {
      recognizer?.destroy()
      recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { speech ->
        speech.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) = emitState("listening")
          override fun onBeginningOfSpeech() = emitState("hearing")
          override fun onRmsChanged(rmsdB: Float) = Unit
          override fun onBufferReceived(buffer: ByteArray?) = Unit
          override fun onEndOfSpeech() = emitState("processing")
          override fun onPartialResults(partialResults: Bundle?) = Unit
          override fun onEvent(eventType: Int, params: Bundle?) = Unit

          override fun onError(error: Int) {
            emit("offlineVoiceError", mapOf("message" to recognitionError(error), "code" to error))
            recognizer?.destroy()
            recognizer = null
          }

          override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val transcript = matches?.firstOrNull()?.trim().orEmpty()
            if (transcript.isBlank()) {
              emit("offlineVoiceError", mapOf("message" to "I didn't catch that. Please try again."))
            } else {
              emit("offlineVoiceResult", mapOf("transcript" to transcript))
            }
          }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, localeTag)
          putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
          putExtra(RecognizerIntent.EXTRA_PROMPT, "Say where you are going")
        }
        speech.startListening(intent)
      }
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    mainHandler.post {
      recognizer?.stopListening()
      recognizer?.destroy()
      recognizer = null
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun speak(text: String, localeTag: String, promise: Promise) {
    mainHandler.post {
      textToSpeech?.shutdown()
      textToSpeech = TextToSpeech(context) { status ->
        if (status != TextToSpeech.SUCCESS) {
          promise.reject("TTS_UNAVAILABLE", "Offline text-to-speech could not start.")
          return@TextToSpeech
        }
        val engine = textToSpeech ?: return@TextToSpeech
        val locale = Locale.forLanguageTag(localeTag)
        val languageResult = engine.setLanguage(locale)
        if (languageResult == TextToSpeech.LANG_MISSING_DATA ||
            languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
          promise.reject("TTS_LANGUAGE_UNAVAILABLE", "The requested offline voice is not installed.")
          return@TextToSpeech
        }
        val offlineVoice = engine.voices
            ?.filter { !it.isNetworkConnectionRequired }
            ?.minByOrNull { if (it.locale == locale) 0 else if (it.locale.language == locale.language) 1 else 2 }
        if (offlineVoice == null || offlineVoice.locale.language != locale.language) {
          promise.reject("TTS_OFFLINE_UNAVAILABLE", "Download an offline English text-to-speech voice first.")
          return@TextToSpeech
        }
        engine.voice = offlineVoice
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "dasig-directions")
        promise.resolve(null)
      }
    }
  }

  private fun emitState(state: String) = emit("offlineVoiceState", mapOf("state" to state))

  private fun emit(eventName: String, payload: Any) {
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, payload)
  }

  private fun recognitionError(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_AUDIO -> "The microphone could not capture audio."
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "The selected offline language is not supported."
    SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "Download the offline speech language before leaving Wi-Fi."
    SpeechRecognizer.ERROR_NO_MATCH -> "I didn't catch that. Try saying “from Ayala to SM.”"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Voice recognition is already running."
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't hear anything. Please try again."
    else -> "On-device voice recognition stopped."
  }

  override fun invalidate() {
    mainHandler.post {
      recognizer?.destroy()
      recognizer = null
      textToSpeech?.shutdown()
      textToSpeech = null
    }
    super.invalidate()
  }
}
