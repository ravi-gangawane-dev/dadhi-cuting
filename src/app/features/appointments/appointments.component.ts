import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CustomDialogComponent } from '../../shared/components/custom-dialog/custom-dialog.component';
import { SalonStoreService } from '../../core/services/salon-store.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
import { Appointment } from '../../shared/models/salon.models';

type EditingAppointment = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  employeeId: string;
  serviceName: string;
};

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [FormsModule, CustomDialogComponent, AppHeaderComponent],
  templateUrl: './appointments.component.html',
  styleUrl: './appointments.component.scss',
})
export class AppointmentsComponent {
  readonly store = inject(SalonStoreService);
  readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly scheduleFilter = signal('all');
  readonly appointments = computed(() => this.store.appointments());
  readonly visibleAppointments = computed(() =>
    this.appointments().filter(
      (a) =>
        this.scheduleFilter() === 'all' ||
        (this.scheduleFilter() === 'today'
          ? a.date === this.store.today()
          : this.scheduleFilter() === 'upcoming'
            ? a.date >= this.store.today() && a.status === 'Booked'
            : a.status === 'Done'),
    ),
  );
  readonly unreadCount = computed(() => this.store.notifications().filter((n) => !n.isRead).length);

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }

  async markDone(id: string): Promise<void> {
    try {
      await this.store.updateAppointmentStatus(id, 'Done');
      this.toast.success('अपॉइंटमेंट पूर्ण मार्केट केला', 'सफलता');
    } catch {
      /* Store displays errors. */
    }
  }

  async markCancelled(id: string): Promise<void> {
    try {
      await this.store.updateAppointmentStatus(id, 'Cancelled');
      this.toast.success('अपॉइंटमेंट रद्द केला', 'रद्द');
    } catch {
      /* Store displays errors. */
    }
  }
  readonly showBooking = signal(false);
  readonly bookingDate = signal(this.store.today());
  readonly startTime = signal('10:00');
  readonly endTime = signal('10:30');
  readonly customerId = signal('');
  readonly employeeId = signal('');
  readonly serviceName = signal('');
  async book() {
    if (this.store.saving()) return;
    try {
      await this.store.addAppointment({
        date: this.bookingDate(),
        time: this.startTime(),
        endTime: this.endTime(),
        customerId: this.customerId(),
        employeeId: this.employeeId(),
        serviceName: this.serviceName(),
      });
      this.showBooking.set(false);
    } catch {}
  }

  readonly editing = signal<EditingAppointment | null>(null);
  readonly deleting = signal<Appointment | null>(null);

  openReschedule(apt: Appointment): void {
    this.editing.set({
      id: apt.id,
      date: apt.date,
      time: apt.time,
      endTime: this.plusMinutes(apt.time, 30),
      employeeId: apt.employeeId,
      serviceName: apt.serviceName,
    });
  }

  patchEditing(patch: Partial<EditingAppointment>): void {
    const current = this.editing();
    if (current) this.editing.set({ ...current, ...patch });
  }

  async saveReschedule(): Promise<void> {
    const e = this.editing();
    if (!e || this.store.saving()) return;
    try {
      await this.store.rescheduleAppointment(e.id, {
        date: e.date,
        time: e.time,
        endTime: e.endTime,
        employeeId: e.employeeId,
        serviceName: e.serviceName,
      });
      this.editing.set(null);
      this.toast.success('Appointment rescheduled');
    } catch {
      /* Store surfaces the error; keep the dialog open. */
    }
  }

  async confirmDelete(): Promise<void> {
    const apt = this.deleting();
    if (!apt || this.store.saving()) return;
    try {
      await this.store.deleteAppointment(apt.id);
      this.deleting.set(null);
      this.toast.success('Appointment deleted');
    } catch {
      /* Store surfaces the error. */
    }
  }

  private plusMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(2000, 0, 1, h || 0, (m || 0) + minutes);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
