// Which status values mean "done", "waiting", "problem" or "in progress" -
// shared by the status badge and the list view.
export const GOOD = ['Completed', 'Normal', 'Reported', 'Paid', 'Active', 'Checked-in', 'Approved', 'Discharged']
export const WATCH = ['Pending', 'Ordered', 'Draft', 'Scheduled', 'Underweight', 'Overweight', 'Low', 'Sample Collected', 'Result Entered']
export const BAD = ['Cancelled', 'Obese', 'High', 'Anemic', 'Overdue', 'Rejected']
export const INFO = ['Admitted', 'Open', 'Submitted']

export function statusTheme(v) {
  if (GOOD.includes(v)) return 'green'
  if (WATCH.includes(v)) return 'orange'
  if (BAD.includes(v)) return 'red'
  if (INFO.includes(v)) return 'blue'
  return 'gray'
}

export function isKnownStatus(v) {
  return statusTheme(v) !== 'gray'
}
