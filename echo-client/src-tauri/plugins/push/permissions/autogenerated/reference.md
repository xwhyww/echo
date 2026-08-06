## Default Permission

Register this install for push notifications: prompt for permission, read the
APNs device token, and report which APNs environment the token belongs to. All
three run once per launch from the registration hook, and the prompt itself is
shown by iOS, which only ever asks the user once per install.

#### This default permission set includes the following:

- `allow-request-permission`
- `allow-get-token`
- `allow-environment`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`push:allow-environment`

</td>
<td>

Enables the environment command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-environment`

</td>
<td>

Denies the environment command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:allow-get-token`

</td>
<td>

Enables the get_token command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-get-token`

</td>
<td>

Denies the get_token command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:allow-request-permission`

</td>
<td>

Enables the request_permission command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-request-permission`

</td>
<td>

Denies the request_permission command without any pre-configured scope.

</td>
</tr>
</table>
