import { useTheme } from "@mui/material";

export const ClosedLogo = ({ customLogo }: { customLogo?: string }) => {
  const theme = useTheme();
  const defaultLogo =
    theme.palette.mode === "dark"
      ? "/agentspan-icon.svg"
      : "/agentspan-icon.svg";

  return (
    <img
      src={customLogo || defaultLogo}
      alt="agentspan"
      style={{
        width: "32px",
        height: "32px",
        objectFit: "contain",
      }}
    />
  );
};
