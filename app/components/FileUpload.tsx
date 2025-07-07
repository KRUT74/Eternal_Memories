"use client"

import type React from "react"

import { useRef } from "react"
import { X } from "lucide-react"

interface FileUploadProps {
  onFileChange: (files: File[]) => void
  files: File[]
  onClose: () => void
}

export default function FileUpload({ onFileChange, files, onClose }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      onFileChange([...files, ...newFiles])
    }
  }

  const removeFile = (index: number) => {
    const newFiles = [...files]
    newFiles.splice(index, 1)
    onFileChange(newFiles)
  }

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium">Attach Files</h3>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <input ref={fileInputRef} type="file" onChange={handleFileChange} multiple className="hidden" />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-4 border border-dashed rounded-lg text-sm text-gray-600 hover:bg-gray-100"
        >
          Click to select files
        </button>

        {files.length > 0 && (
          <div className="mt-2">
            <h4 className="text-xs font-medium mb-1">Selected Files:</h4>
            <ul className="space-y-1">
              {files.map((file, index) => (
                <li key={index} className="flex justify-between items-center text-xs bg-white p-2 rounded">
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-red-500 hover:text-red-700 ml-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
