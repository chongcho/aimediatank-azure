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
 * SurfaceView punches a hole behind the window and often stays black inside a Dialog;
 * TextureView composites in the normal view hierarchy so local/remote frames actually paint.
 *
 * Lifecycle: [release] must run BEFORE Dialog.dismiss. [release] nulls the surface listener
 * so dismiss does not call into a disposed EglRenderer (Samsung process abort).
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
        eglRenderer.init(sharedContext, EglBase.CONFIG_PLAIN, GlRectDrawer())
        isInitialized = true
        surfaceTexture?.let { ensureEglSurface(it) }
    }

    fun setMirror(mirror: Boolean) {
        this.mirror = mirror
        if (!isReleased && isInitialized) {
            eglRenderer.setMirror(mirror)
        }
    }

    fun setScalingType(@Suppress("UNUSED_PARAMETER") scalingType: RendererCommon.ScalingType) {
        // Aspect fill via layout; EglRenderer draws into the full TextureView.
    }

    override fun onFrame(frame: VideoFrame) {
        if (!isInitialized || isReleased || !hasEglSurface) return
        eglRenderer.onFrame(frame)
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
        // [release] already nulled the listener in the normal path. If we still get here
        // (Activity teardown), never block main and never touch a released EglRenderer.
        if (isReleased || !isInitialized) {
            return false
        }
        try {
            eglRenderer.releaseEglSurface { /* async — do not latch on main */ }
        } catch (err: Exception) {
            Log.w(TAG, "releaseEglSurface: ${err.message}")
        }
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
        // Prevent Dialog.dismiss → onSurfaceTextureDestroyed from touching EglRenderer.
        surfaceTextureListener = null
        hasEglSurface = false
        try {
            eglRenderer.release()
        } catch (err: Exception) {
            Log.w(TAG, "eglRenderer.release: ${err.message}")
        }
        isInitialized = false
    }
}
