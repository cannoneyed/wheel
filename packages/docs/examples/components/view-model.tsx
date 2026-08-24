import { componentRoot, connect, view, Service } from 'wheel/core';

interface IssueVm {
  readonly issue: {
    readonly id: string;
    readonly title: string;
  };
}

export class ViewOptionsService extends Service {
  private readonly issues = this.atom<readonly IssueVm[]>([], 'issues');

  readonly issueVm = this.computedFor(
    (_teamId: string, issueId: string): IssueVm | undefined =>
      this.issues.get().find((vm) => vm.issue.id === issueId)
  );
}

const connectIssueDetail = connect(
  (props: { teamId: string; issueId: string }) =>
    `IssueDetail:${props.issueId}`,
  (context, props: { teamId: string; issueId: string }) => {
    const viewOptions = context.service(ViewOptionsService);
    return view({
      vm: () => viewOptions.issueVm(props.teamId, props.issueId)
    });
  }
);

export function IssueDetail(props: {
  teamId: string;
  issueId: string;
}) {
  const state = connectIssueDetail(props);
  return (
    <h1 use:componentRoot>{state.vm?.issue.title ?? 'Issue not found'}</h1>
  );
}
