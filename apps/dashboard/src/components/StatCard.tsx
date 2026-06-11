type StatCardProps = {
  label: string;
  value: number;
  colorClass: string;
};

export function StatCard({ label, value, colorClass }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}
