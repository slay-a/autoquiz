/**
 * Tests for Upload component (FEAT-005).
 *
 * Tests cover:
 * - AC-5.1.1: Client-side file type validation
 * - AC-5.1.2: Client-side file size validation and HTTP 413 handling
 * - User interactions (file selection, drag & drop)
 * - Error display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Upload from '../components/Upload';

describe('Upload Component', () => {
  let mockUploadHandler;

  beforeEach(() => {
    mockUploadHandler = vi.fn();
  });

  describe('File Type Validation (AC-5.1.1)', () => {
    it('accepts .pdf files', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const pdfFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
      const input = container.querySelector('input[type="file"]');

      // Simulate file selection
      Object.defineProperty(input, 'files', {
        value: [pdfFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(mockUploadHandler).toHaveBeenCalledWith(pdfFile);
      });

      // Should not show error
      expect(screen.queryByText(/Unsupported type/i)).not.toBeInTheDocument();
    });

    it('accepts .docx files', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const docxFile = new File(['docx content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [docxFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(mockUploadHandler).toHaveBeenCalledWith(docxFile);
      });

      expect(screen.queryByText(/Unsupported type/i)).not.toBeInTheDocument();
    });

    it('accepts .pptx files', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const pptxFile = new File(['pptx content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [pptxFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(mockUploadHandler).toHaveBeenCalledWith(pptxFile);
      });

      expect(screen.queryByText(/Unsupported type/i)).not.toBeInTheDocument();
    });

    it('rejects .txt files before calling uploadHandler', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const txtFile = new File(['text content'], 'test.txt', { type: 'text/plain' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [txtFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/Unsupported type ".txt"/i)).toBeInTheDocument();
      });

      // Should NOT call the upload handler
      expect(mockUploadHandler).not.toHaveBeenCalled();
    });

    it('rejects .zip files before calling uploadHandler', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const zipFile = new File(['zip content'], 'test.zip', { type: 'application/zip' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [zipFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/Unsupported type ".zip"/i)).toBeInTheDocument();
      });

      expect(mockUploadHandler).not.toHaveBeenCalled();
    });

    it('rejects .jpg files before calling uploadHandler', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const jpgFile = new File(['jpg content'], 'test.jpg', { type: 'image/jpeg' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [jpgFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/Unsupported type ".jpg"/i)).toBeInTheDocument();
      });

      expect(mockUploadHandler).not.toHaveBeenCalled();
    });
  });

  describe('File Size Validation (AC-5.1.2)', () => {
    it('rejects files larger than 50MB before calling uploadHandler', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      // Create a 51MB file
      const largeContent = new Array(51 * 1024 * 1024).fill('x').join('');
      const largeFile = new File([largeContent], 'large.pdf', { type: 'application/pdf' });

      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [largeFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/File must be under 50MB/i)).toBeInTheDocument();
      });

      expect(mockUploadHandler).not.toHaveBeenCalled();
    });

    it('accepts files exactly at 50MB limit', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      // Create exactly 50MB file
      const content = new Array(50 * 1024 * 1024).fill('x').join('');
      const file = new File([content], 'exactly50mb.pdf', { type: 'application/pdf' });

      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(mockUploadHandler).toHaveBeenCalledWith(file);
      });

      expect(screen.queryByText(/File must be under 50MB/i)).not.toBeInTheDocument();
    });

    it('displays error message when upload handler throws 413 error', async () => {
      const error413Handler = vi.fn().mockRejectedValue(new Error('File exceeds 50MB limit'));

      const { container } = render(<Upload onUpload={error413Handler} />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/File exceeds 50MB limit/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('renders upload zone with correct text', () => {
      render(<Upload onUpload={mockUploadHandler} />);

      expect(screen.getByText(/Drag & drop or click to upload/i)).toBeInTheDocument();
      expect(screen.getByText(/PDF · DOCX · PPTX — up to 50MB/i)).toBeInTheDocument();
    });

    it('supports onSuccess prop for backward compatibility', async () => {
      const onSuccessHandler = vi.fn();
      const { container } = render(<Upload onSuccess={onSuccessHandler} />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onSuccessHandler).toHaveBeenCalledWith(file);
      });
    });

    it('shows uploading state during upload', async () => {
      const slowHandler = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      const { container } = render(<Upload onUpload={slowHandler} />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(input);

      // Should show uploading state
      await waitFor(() => {
        expect(screen.getByText(/Uploading test.pdf/i)).toBeInTheDocument();
      });
    });

    it('clears error when dismiss button is clicked', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const txtFile = new File(['text'], 'test.txt', { type: 'text/plain' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [txtFile],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/Unsupported type/i)).toBeInTheDocument();
      });

      // Click the dismiss button (X icon)
      const dismissButton = screen.getByRole('button', { name: '' });
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/Unsupported type/i)).not.toBeInTheDocument();
      });
    });

    it('handles drag and drop', async () => {
      const { container } = render(<Upload onUpload={mockUploadHandler} />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const dropZone = screen.getByText(/Drag & drop or click to upload/i).closest('div');

      // Simulate dragover
      fireEvent.dragOver(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText(/Drop it!/i)).toBeInTheDocument();
      });

      // Simulate drop
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(mockUploadHandler).toHaveBeenCalledWith(file);
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message when upload fails', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Upload failed'));

      const { container } = render(<Upload onUpload={failingHandler} />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const input = container.querySelector('input[type="file"]');

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/Upload failed/i)).toBeInTheDocument();
      });
    });

  });
});
