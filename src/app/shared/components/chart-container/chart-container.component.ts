import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-chart-container',
  standalone: true,
  templateUrl: './chart-container.component.html',
  styleUrl: './chart-container.component.scss',
})
export class ChartContainerComponent {
  readonly title = input<string>('Revenue trend');
  readonly startLabel = input<string>('');
  readonly endLabel = input<string>('');
  readonly data = input<{ label: string; value: number }[]>([]);

  readonly points = computed(() => {
    const rows = this.data();
    const max = Math.max(...rows.map((r) => r.value), 1);
    return rows.map((r, i) => ({
      x: rows.length === 1 ? 178 : 10 + (i * 336) / (rows.length - 1),
      y: 105 - (Math.max(0, r.value) / max) * 85,
      label: r.label,
      value: r.value,
    }));
  });
  readonly line = computed(() =>
    this.points()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
  readonly area = computed(() =>
    this.points().length
      ? `${this.line()} ${this.points().at(-1)!.x},105 ${this.points()[0].x},105`
      : '',
  );

  readonly labels = computed(() => {
    const d = this.data();
    if (!d || d.length === 0) return [];
    const count = d.length;
    const step = Math.max(1, Math.ceil(count / 6));
    return d.filter((_, i) => i % step === 0 || i === count - 1).map((r) => r.label.slice(5));
  });
}
