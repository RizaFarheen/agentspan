import { OpenedLogo } from "components/Sidebar/OpenedLogo";
import { useContext } from "react";
import { ColorModeContext } from "theme/material/ColorModeContext";
import { FEATURES, featureFlags } from "utils";

const customLogo = featureFlags.getValue(FEATURES.CUSTOM_LOGO_URL);

export default function AppLogo() {
  const { mode } = useContext(ColorModeContext);

  return customLogo ? (
    <OpenedLogo customLogo={customLogo} width="60%" pl={6} />
  ) : (
    <img
      src={mode === "dark" ? "/agentspan-logo-dark.svg" : "/agentspan-logo-light.svg"}
      alt="agentspan"
      style={{
        width: "140px",
        marginRight: 30,
      }}
    />
  );
}
