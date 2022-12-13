import { Row } from "antd";
import { useBlockList } from "@/hooks/useRollupInfo";
import "antd/dist/antd.min.css";
import { Typography, Theme, Box, Breadcrumbs } from "@mui/material";
import Header from "../components/Header";
import { useParams, Link } from "react-router-dom";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Table from "./Table";

const Blocks = () => {
  const params = useParams();
  const { blocks } = useBlockList(params.batchIndex);

  return (
    <Box className="wrapper mx-auto" sx={{ marginBottom: "16rem" }}>
      <Header />
      {blocks ? (
        <>
          <Breadcrumbs
            aria-label="breadcrumb"
            sx={{ fontWeight: 600 }}
            separator={<NavigateNextIcon fontSize="large" />}
          >
            <Link to="/rollupscan">All results</Link>
            <Link to={`/rollupscan/batch/${params.batchIndex}`}>
              Batch {params.batchIndex}
            </Link>
            <Typography color="text.primary" sx={{ fontWeight: 600 }}>
              Block {params.blockId}
            </Typography>
          </Breadcrumbs>
          <Table blocks={blocks} />
        </>
      ) : null}
    </Box>
  );
};

export default Blocks;
