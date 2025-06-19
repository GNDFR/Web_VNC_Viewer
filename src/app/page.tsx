import RemoteGazerClient from '@/components/remote-gazer/RemoteGazerClient';

export default function RemoteGazerPage() {
  return (
    // The RemoteGazerClient itself now manages the h-screen and flex layout
    <RemoteGazerClient />
  );
}
