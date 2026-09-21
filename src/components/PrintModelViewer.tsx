'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PreviewMeshData } from '@/lib/imageToStl'

type Props = {
  mesh: PreviewMeshData | null
  wireframe?: boolean
  className?: string
}

/**
 * Orbitable Three.js viewport for reviewing a generated print mesh.
 * Drag to rotate, scroll to zoom, right-drag to pan.
 */
export default function PrintModelViewer({ mesh, wireframe = false, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const meshRef = useRef<PreviewMeshData | null>(null)
  const wireframeRef = useRef(wireframe)
  const applyMeshRef = useRef<(data: PreviewMeshData | null) => void>(() => {})
  const setWireframeRef = useRef<(w: boolean) => void>(() => {})

  meshRef.current = mesh
  wireframeRef.current = wireframe

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    camera.position.set(80, 70, 110)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 10, 0)
    controls.minDistance = 15
    controls.maxDistance = 800

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.05)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(60, 120, 40)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.35)
    fill.position.set(-80, 40, -60)
    scene.add(fill)

    const grid = new THREE.GridHelper(200, 20, 0x3a3a3a, 0x2a2a2a)
    grid.position.y = 0
    scene.add(grid)

    let model: THREE.Mesh | null = null
    let material: THREE.MeshStandardMaterial | null = null

    const clearModel = () => {
      if (!model) return
      scene.remove(model)
      model.geometry.dispose()
      if (Array.isArray(model.material)) model.material.forEach((m) => m.dispose())
      else model.material.dispose()
      model = null
      material = null
    }

    applyMeshRef.current = (data) => {
      clearModel()
      if (!data) {
        controls.target.set(0, 10, 0)
        camera.position.set(80, 70, 110)
        controls.update()
        return
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()

      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.05,
        flatShading: false,
        side: THREE.DoubleSide,
        wireframe: wireframeRef.current,
      })

      model = new THREE.Mesh(geometry, material)
      scene.add(model)

      const sphere = geometry.boundingSphere
      if (sphere) {
        const r = Math.max(sphere.radius, 1)
        controls.target.copy(sphere.center)
        camera.position.set(
          sphere.center.x + r * 1.6,
          sphere.center.y + r * 1.1,
          sphere.center.z + r * 1.8
        )
        controls.minDistance = r * 0.3
        controls.maxDistance = r * 12
        controls.update()
      }
    }

    setWireframeRef.current = (w) => {
      if (material) material.wireframe = w
    }

    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    applyMeshRef.current(meshRef.current)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      clearModel()
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    applyMeshRef.current(mesh)
  }, [mesh])

  useEffect(() => {
    setWireframeRef.current(wireframe)
  }, [wireframe])

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ touchAction: 'none' }}
      aria-label="3D model viewer — drag to rotate, scroll to zoom"
    />
  )
}
