import { LoadScript, GoogleMap, Marker } from '@react-google-maps/api';

const containerStyle = { width: '100%', height: '100%' };

export default function EmergencyMap({ position, label }) {
  if (!position) return <div className="h-full flex items-center justify-center text-slate-400">Select an emergency</div>;

  return (
           <LoadScript googleMapsApiKey="">
      <GoogleMap mapContainerStyle={containerStyle} center={position} zoom={15}>
        <Marker position={position} title={label} />
      </GoogleMap>
    </LoadScript>
  );
}