// Phone frame for the projector: the mirrored /app session sits inside at 390x844, scaled to fit.
import React from 'react';

export default function PhoneFrame({ children, label = 'Customer phone (live mirror)' }: { children: React.ReactNode; label?: string }) {
  return (
    <figure className="stage-phone" aria-label={label}>
      <div className="stage-phone-screen">{children}</div>
      <figcaption className="stage-caption">{label}</figcaption>
    </figure>
  );
}
