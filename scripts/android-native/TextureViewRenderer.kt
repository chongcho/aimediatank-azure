package com.capacitor.voipcalls

import android.content.Context
import android.graphics.SurfaceTexture
import android.util.Log
import android.view.TextureView
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.GlRectDrawer
import org.webrtc.RendererCommon
import org.webrtc.ThreadUtils
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import java.util.concurrent.CountDownLatch

/**
 * TextureView-backed WebRTC renderer.
 * SurfaceView punches a hole behind the window and often stays black inside a Dialog;
 * TextureView composites in the normal view hierarchy so local/remote frames actually paint.
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
        if (isInitialized) return
        eglRenderer.init(sharedContext, EglBase.CONFIG_PLAIN, GlRectDrawer())
        isInitialized = true
        surfaceTexture?.let { ensureEglSurface(it) }
    }

    fun setMirror(mirror: Boolean) {
        this.mirror = mirror
        eglRenderer.setMirror(mirror)
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
        updateAspectRatio(width, height)
    }

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        hasEglSurface = false
        val latch = CountDownLatch(1)
        eglRenderer.releaseEglSurface { latch.countDown() }
        ThreadUtils.awaitUninterruptibly(latch)
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}

    private fun ensureEglSurface(surface: SurfaceTexture) {
        if (hasEglSurface) {
            onSurfaceReady?.invoke()
            return
        }
        eglRenderer.createEglSurface(surface)
        hasEglSurface = true
        onSurfaceReady?.invoke()
    }

    private fun updateAspectRatio(width: Int, height: Int) {
        if (width <= 0 || height <= 0) return
        eglRenderer.setLayoutAspectRatio(width.toFloat() / height.toFloat())
    }

    fun release() {
        if (isReleased) return
        isReleased = true
        onSurfaceReady = null
        surfaceTextureListener = null
        hasEglSurface = false
        eglRenderer.release()
        isInitialized = false
    }
}
