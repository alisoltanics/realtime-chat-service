import Avatar from "@mui/material/Avatar";
import AvatarGroup from "@mui/material/AvatarGroup";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { initials } from "../lib/format.js";
import { getSession } from "../lib/session.js";

/**
 * Presence is owned by the realtime service (in-memory, TTL swept) and only the
 * ids of online users are broadcast - no extra REST call is needed here.
 */
export default function PresenceBar({ onlineIds = [], joined = false }) {
  const currentUserId = getSession()?.user?.id ?? null;
  const others = onlineIds.filter((id) => String(id) !== String(currentUserId));
  const isOnlineHere = onlineIds.some((id) => String(id) === String(currentUserId));

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <AvatarGroup
        max={5}
        sx={{
          flexDirection: "row-reverse",
          "& .MuiAvatar-root": { width: 26, height: 26, fontSize: 11, borderColor: "#111c31" },
        }}
      >
        {others.map((id) => (
          <Tooltip key={id} title={`کاربر #${id}`}>
            <Avatar sx={{ bgcolor: "secondary.main" }}>{initials(String(id))}</Avatar>
          </Tooltip>
        ))}
      </AvatarGroup>
      <Typography variant="caption" sx={{ opacity: 0.75 }}>
        {joined
          ? `${onlineIds.length} آنلاین`
          : "در حال ورود به اتاق…"}
        {isOnlineHere && joined ? " (شما)" : ""}
      </Typography>
    </Box>
  );
}