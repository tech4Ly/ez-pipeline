/// <reference types="react/experimental" />
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Progress from "@mui/material/LinearProgress";
import Button from "@mui/lab/LoadingButton";
import { apiDispatch, PipelineName } from "./api/getPipelineStatus";
import apiSetActiveCommit from "./api/apiSetActiveCommit";
import { PageLoader } from "./PageloaderProvider";
import Grid from "@mui/material/Grid2";
import { ErrorBoundary } from "react-error-boundary";
import {
    Suspense,
    use,
    useState,
    useRef,
    lazy,
    FC,
    MutableRefObject,
} from "react";
import { Status } from "@pipeline/server/src/utils";

const App = () => {
    return (
        <Box>
            <Container>
                <Box>
                    <Typography variant="h4">ODC Pipieline</Typography>
                </Box>
                <Box>
                    <PipelineStatus name="streams2-frontend" />
                    <PipelineStatus name="streams2-str" />
                    <PipelineStatus name="streams2-nl" />
                    <PipelineStatus name="streams2-fps" />
                </Box>
            </Container>
        </Box>
    );
};

const PipelineStatus = ({ name }: { name: PipelineName }) => {
    const fetcher = useRef(apiDispatch(name));
    return (
        <Box mt={4}>
            <Paper>
                <Box p={2}>
                    <Typography variant="h5">{name}</Typography>
                    <ErrorBoundary fallback={<h1>Error</h1>}>
                        <Suspense fallback={<PageLoader />}>
                            <PipelineStatusResource
                                name={name}
                                fetcher={fetcher}
                            />
                        </Suspense>
                    </ErrorBoundary>
                </Box>
            </Paper>
        </Box>
    );
};

const PipelineStatusResource = ({
    name,
    fetcher,
}: {
    name: PipelineName;
    fetcher: MutableRefObject<ReturnType<typeof apiDispatch>>;
}) => {
    console.log("stuck on fetching data");
    const data = use(fetcher.current);
    console.log("data", data);
    return (
        <Box mt={1}>
            {data.buildingStatus.length < 1 && (
                <Box>
                    <Typography>Empty Pipeline</Typography>
                </Box>
            )}
            {data.buildingStatus.map((p) => {
                const setColor = <
                    S extends string,
                    E extends string,
                    N extends string | undefined,
                >(
                    success: S,
                    error: E,
                    normal?: N,
                ) => {
                    return p.status === "Success"
                        ? success
                        : p.status === "Failure"
                          ? error
                          : normal;
                };
                return (
                    <Box key={p.commitId} p={2}>
                        <CommitTitle
                            name={name}
                            status={p.status}
                            commitId={p.commitId}
                        />
                        <Progress
                            variant="determinate"
                            value={p.progression}
                            color={setColor("success", "error")}
                            sx={{ mt: 2 }}
                        />
                        <Box
                            sx={{
                                mt: 2,
                                border: 2,
                                borderColor: setColor(
                                    "success.main",
                                    "error.main",
                                    "primary.main",
                                ),
                                borderRadius: 1,
                            }}
                        >
                            <Grid container>
                                <Grid size="grow">
                                    <Box p={5} textAlign="center">
                                        test
                                    </Box>
                                </Grid>
                                <Grid size="grow">
                                    <Box p={5} textAlign="center">
                                        test
                                    </Box>
                                </Grid>
                                <Grid size="grow">
                                    <Box p={5} textAlign="center">
                                        test
                                    </Box>
                                </Grid>
                                <Grid size="grow">
                                    <Box p={5} textAlign="center">
                                        test
                                    </Box>
                                </Grid>
                            </Grid>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

const CommitTitle = ({
    name,
    status,
    commitId,
}: {
    name: PipelineName;
    status: Status;
    commitId: string;
}) => {
    const [loading, setLoading] = useState(false);
    return (
        <Box>
            <Typography variant="h6" component={"span"}>
                Commit ID:{" "}
            </Typography>
            <Typography variant="h6" component={"span"}>
                <Button>{commitId}</Button>
            </Typography>
            <Typography component="span">
                <Button
                    sx={{ ml: 1 }}
                    size="small"
                    loading={loading}
                    variant="contained"
                    disabled={status !== "Success"}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            await apiSetActiveCommit(name, commitId);
                        } catch {
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    激活
                </Button>
            </Typography>
        </Box>
    );
};

export default App;
