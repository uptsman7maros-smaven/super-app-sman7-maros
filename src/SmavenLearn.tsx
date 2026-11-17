import type { SchoolUser } from "./context/school-context";

export default function SmavenLearn(props: {
  currentUser: SchoolUser;
  userRole: string;
  userName?: string;
}) {
  const userName = props.currentUser.full_name || props.userName || props.currentUser.username;
  const smavenLearnUrl =
    `${import.meta.env.BASE_URL}smaven-learn/index.html`;

  return (
    <section
      className="smaven-static-module"
      aria-label={`SMAVEN Learn untuk ${userName} (${props.userRole})`}
    >
      <iframe
        src={smavenLearnUrl}
        title={`SMAVEN Learn - ${userName}`}
        className="smaven-static-module-frame"
      />
    </section>
  );
}