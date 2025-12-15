
import { Component, ChangeDetectionStrategy, signal, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  // --- Signals for State Management ---
  imageFile = signal<File | null>(null);
  threshold = signal<number>(20);
  processing = signal<boolean>(false);
  processedImageReady = signal<boolean>(false);

  // --- ViewChild to access canvas elements ---
  @ViewChild('originalCanvas') originalCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('processedCanvas') processedCanvasRef!: ElementRef<HTMLCanvasElement>;

  private originalImage: HTMLImageElement | null = null;
  private originalImageData: ImageData | null = null;

  constructor() {
    // Effect to trigger image processing when the file or threshold changes
    effect(() => {
      const file = this.imageFile();
      const thresh = this.threshold(); // a to trigger on change
      if (file) {
        if(this.originalImage && this.originalImageData){
            this.processImage();
        } else {
            this.loadImage(file);
        }
      }
    }, { allowSignalWrites: true });
  }

  // --- Event Handlers for File Input ---

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.resetStateBeforeLoad();
      this.imageFile.set(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.add('bg-sky-100', 'border-sky-600');
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('bg-sky-100', 'border-sky-600');
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('bg-sky-100', 'border-sky-600');

    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      this.resetStateBeforeLoad();
      this.imageFile.set(event.dataTransfer.files[0]);
    }
  }

  onThresholdChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.threshold.set(value);
  }

  // --- Core Image Processing Logic ---

  private loadImage(file: File): void {
    this.processing.set(true);
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.originalImage = new Image();
      this.originalImage.onload = () => {
        this.setupCanvases();
        this.processImage();
      };
      this.originalImage.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  private setupCanvases(): void {
    if (!this.originalImage) return;

    const originalCanvas = this.originalCanvasRef.nativeElement;
    const processedCanvas = this.processedCanvasRef.nativeElement;
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });

    if (!originalCtx) return;

    originalCanvas.width = this.originalImage.naturalWidth;
    originalCanvas.height = this.originalImage.naturalHeight;
    processedCanvas.width = this.originalImage.naturalWidth;
    processedCanvas.height = this.originalImage.naturalHeight;
    
    originalCtx.drawImage(this.originalImage, 0, 0);
    this.originalImageData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
  }

  private processImage(): void {
    if (!this.originalImageData) return;

    this.processing.set(true);
    this.processedImageReady.set(false);

    // Use setTimeout to allow the UI to update with "Processing..." message
    setTimeout(() => {
        const processedCanvas = this.processedCanvasRef.nativeElement;
        const processedCtx = processedCanvas.getContext('2d');
        if (!processedCtx) return;

        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        const data = imageData.data;
        const bgColor = this.detectBackgroundColor(this.originalImageData);
        const threshold = this.threshold();

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (this.colorDistance(r, g, b, bgColor.r, bgColor.g, bgColor.b) < threshold) {
                data[i + 3] = 0; // Set alpha to 0 (transparent)
            }
        }
        processedCtx.clearRect(0,0, processedCanvas.width, processedCanvas.height);
        processedCtx.putImageData(imageData, 0, 0);
        
        this.processing.set(false);
        this.processedImageReady.set(true);
    }, 50); // Small delay for UI render
  }
  
  private detectBackgroundColor(imageData: ImageData): { r: number, g: number, b: number } {
    const { width, height, data } = imageData;
    const corners = [
        this.getPixel(0, 0, width, data),          // top-left
        this.getPixel(width - 1, 0, width, data),   // top-right
        this.getPixel(0, height - 1, width, data),  // bottom-left
        this.getPixel(width - 1, height - 1, width, data) // bottom-right
    ];
    
    // Simple average of corner colors
    const avgColor = corners.reduce((acc, c) => {
        acc.r += c.r;
        acc.g += c.g;
        acc.b += c.b;
        return acc;
    }, { r: 0, g: 0, b: 0 });

    return {
        r: Math.round(avgColor.r / corners.length),
        g: Math.round(avgColor.g / corners.length),
        b: Math.round(avgColor.b / corners.length),
    };
  }
  
  private getPixel(x: number, y: number, width: number, data: Uint8ClampedArray) {
    const i = (y * width + x) * 4;
    return { r: data[i], g: data[i+1], b: data[i+2] };
  }

  private colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
  }

  // --- Action Buttons ---

  downloadImage(): void {
    const canvas = this.processedCanvasRef.nativeElement;
    const link = document.createElement('a');
    link.download = `${this.imageFile()?.name.split('.')[0]}_sem_fundo.png` ?? 'imagem_sem_fundo.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  reset(): void {
      this.resetStateBeforeLoad();
      this.imageFile.set(null);
  }

  private resetStateBeforeLoad(): void {
    this.originalImage = null;
    this.originalImageData = null;
    this.processedImageReady.set(false);
    this.threshold.set(20);
  }
}
