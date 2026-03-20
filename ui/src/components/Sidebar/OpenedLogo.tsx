import Stack, { StackProps } from "@mui/material/Stack";
import { useColorScheme, useTheme } from "@mui/material";

export const OpenedLogo = ({
  customLogo,
  ...rest
}: StackProps & {
  customLogo?: string;
}) => {
  const theme = useTheme();
  const defaultLogo =
    theme.palette.mode === "dark"
      ? "/agentspan-logo-dark.svg"
      : "/agentspan-logo-light.svg";

  return (
    <Stack
      {...rest}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      height="100%"
      sx={
        customLogo
          ? {
              position: "relative",
              width: "100%",
              height: "100%",
              backgroundImage: `url(${customLogo})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              transition: "all 0.2s ease-in-out",
            }
          : {
              transition: "all 0.2s ease-in-out",
            }
      }
    >
      {customLogo ? (
        <img
          width="40px"
          src={defaultLogo}
          alt="Powered by agentspan"
          style={{
            position: "absolute",
            bottom: "4px",
            right: "4px",
            opacity: 0.8,
            maxHeight: "20px",
            objectFit: "contain",
            transition: "all 0.2s ease-in-out",
          }}
        />
      ) : (
        <img
          src={defaultLogo}
          alt="agentspan"
          style={{
            transition: "all 0.2s ease-in-out",
            height: "100%",
            maxWidth: "80%",
            objectFit: "contain",
          }}
        />
      )}
    </Stack>
  );
};
