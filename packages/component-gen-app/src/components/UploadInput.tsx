/**
 * `@huaqiu/component-gen-app` — image upload control (click + paste + drag).
 *
 * Reads a file, downscales it to a thumbnail data URL if needed (bounded by
 * `maxBytes`), and reports both the original file and the data URL to the
 * parent. The parent owns sending it to the server.
 */
import { useCallback, useRef, useState, type ReactElement } from 'react'
import type { Translate } from '../copy/index.js'

export interface UploadInputProps {
  maxBytes: number
  t: Translate
  disabled?: boolean
  imageDataUrl?: string | null
  /** original file, for the server to store into history. */
  file?: File | null
  onFile: (file: File | null, dataUrl: string | null) => void
}

const MAX_EDGE = 1600

/** Downscale an image file to a data URL bounded in edge + bytes. */
export function fileToDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('failed to read file'))
    reader.onload = () => {
      const src = String(reader.result)
      if (src.length <= maxBytes) { resolve(src); return }
      // Too big as-is — downscale via canvas.
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas unavailable')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        let out = canvas.toDataURL('image/jpeg', 0.82)
        // Quality ladder until it fits (or we give up after several tries).
        for (const q of [0.7, 0.55, 0.4]) {
          if (out.length <= maxBytes) break
          out = canvas.toDataURL('image/jpeg', q)
        }
        resolve(out)
      }
      img.onerror = () => reject(new Error('failed to decode image'))
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

export function UploadInput(props: UploadInputProps): ReactElement {
  const { maxBytes, t, disabled = false, imageDataUrl = null, file = null, onFile } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = useCallback(async (f: File | null): Promise<void> => {
    if (!f) return
    if (f.size > maxBytes) {
      setError(t('upload.imageTooLarge'))
      return
    }
    setError(null)
    try {
      const dataUrl = await fileToDataUrl(f, maxBytes)
      onFile(f, dataUrl)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    }
  }, [maxBytes, onFile, t])

  return (
    <div
      className={`cga-upload${dragging ? ' cga-upload--dragging' : ''}`}
      onClick={() => { if (!disabled) inputRef.current?.click() }}
      onDragOver={(ev) => { ev.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(ev) => {
        ev.preventDefault()
        setDragging(false)
        if (disabled) return
        void accept(ev.dataTransfer.files?.[0] ?? null)
      }}
      onPaste={(ev) => {
        const item = Array.from(ev.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
        if (item) {
          ev.preventDefault()
          void accept(item.getAsFile())
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(ev) => { void accept(ev.target.files?.[0] ?? null); ev.target.value = '' }}
      />
      {imageDataUrl
        ? (
          <>
            <img className="cga-upload__thumb" src={imageDataUrl} alt="" />
            <div className="cga-upload__text">{file?.name ?? ''}</div>
          </>
        )
        : null}
      <div className="cga-upload__text">
        {imageDataUrl ? t('upload.replace') : t('upload.drop')}
        <br />{t('upload.paste')}
      </div>
      {error ? <div className="cga-upload__text" style={{ color: 'var(--dsw-alias-state-error-primary, red)' }}>{error}</div> : null}
      {!imageDataUrl ? <button type="button" className="cga-upload__browse">{t('upload.browse')}</button> : null}
    </div>
  )
}
