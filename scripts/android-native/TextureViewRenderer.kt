package com.capacitor.voipcalls

import android.content.Context
import android.graphics.SurfaceTexture
import android.util.Log
import android.view.TextureView
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.GlRectDrawer
import org.webrtc.RendererCommon
import org.webrtc.VideoFrame
import org.webrtc.VideoSink

/**
 * TextureView-backed WebRTC renderer.
 *
 * Samsung aborts the process when [EglRenderer.release] runs during Dialog dismiss
 * ("Clear cache for AiMediaTank?"). [release] therefore only detaches the listener and
 * stops accepting frames — it does **not** call eglRenderer.release().
 */
class TextureViewRenderer(context: Context) :
    TextureView(context),
    VideoSink,
    TextureView.SurfaceTextureListener {

    companion object {
        private const val TAG = "TextureViewRenderer"
    }

    private val eglRenderer = EglRenderer("TextureViewRenderer")
    private var isInitialized = false
    private var isReleased = false
    private var hasEglSurface = false
    private var mirror = false
    var onSurfaceReady: (() -> Unit)? = null

    init {
        surfaceTextureListener = this
    }

    fun init(sharedContext: EglBase.Context) {
        if (isInitialized || isReleased) return
        try {
            eglRenderer.init(sharedContext, EglBase.CONFIG_PLAIN, GlRectDrawer())
            isInitialized = true
            surfaceTexture?.let { ensureEglSurface(it) }
        } catch (err: Exception) {
            Log.e(TAG, "init failed: ${err.message}")
            isReleased = true
        }
    }

    fun setMirror(mirror: Boolean) {
        this.mirror = mirror
        if (!isReleased && isInitialized) {
            try {
                eglRenderer.setMirror(mirror)
            } catch (_: Exception) {
            }
        }
    }

    fun setScalingType(@Suppress("UNUSED_PARAMETER") scalingType: RendererCommon.ScalingType) {
    }

    override fun onFrame(frame: VideoFrame) {
        if (!isInitialized || isReleased || !hasEglSurface) return
        try {
            eglRenderer.onFrame(frame)
        } catch (_: Exception) {
        }
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        if (!isInitialized || isReleased) return
        Log.i(TAG, "surface available ${width}x$height")
        ensureEglSurface(surface)
        updateAspectRatio(width, height)
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
        if (!isInitialized || isReleased) return
        updateAspectRatio(width, height)
    }

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        hasEglSurface = false
        // Never block main; never call into EglRenderer after [release].
        return false
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}

    private fun ensureEglSurface(surface: SurfaceTexture) {
        if (hasEglSurface || isReleased || !isInitialized) {
            if (hasEglSurface && !isReleased) onSurfaceReady?.invoke()
            return
        }
        try {
            eglRenderer.createEglSurface(surface)
            hasEglSurface = true
            onSurfaceReady?.invoke()
        } catch (err: Exception) {
            Log.w(TAG, "createEglSurface: ${err.message}")
        }
    }

    private fun updateAspectRatio(width: Int, height: Int) {
        if (width <= 0 || height <= 0 || isReleased || !isInitialized) return
        try {
            eglRenderer.setLayoutAspectRatio(width.toFloat() / height.toFloat())
        } catch (_: Exception) {
        }
    }

    fun release() {
        if (isReleased) return
        isReleased = true
        onSurfaceReady = null
        surfaceTextureListener = null
        hasEglSurface = false
        isInitialized = false
        // Intentionally skip eglRenderer.release() — it CountDownLatch-waits the GL thread
        // and aborts AiMediaTank on Samsung when the video Dialog is tearing down.
    }
}
